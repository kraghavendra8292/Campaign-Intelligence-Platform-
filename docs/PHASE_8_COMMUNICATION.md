# Phase 8 — Citizen Communication and Follow-Up

How the platform talks back to the people who report problems: what a citizen
can see, what they must prove to change anything, what staff can say in the
organisation's name, and what this system refuses to become. Companion to
[ISSUES_AND_FEEDBACK.md](./ISSUES_AND_FEEDBACK.md) (Phase 5, which collects the
reports), [PHASE_6_AI_INTELLIGENCE.md](./PHASE_6_AI_INTELLIGENCE.md) and
[AUTHENTICATION.md](./AUTHENTICATION.md).

Phase 8 is additive. Phases 1–7 changed in exactly three places, all listed in
§14.

---

## 1. What this phase is, and the line it must not cross

This is the first phase in which the platform **speaks to a member of the
public** rather than only listening. That makes it the phase where the product
could most easily become something else: a channel that can email somebody about
their pothole is, mechanically, a channel that could email them a slogan.

The boundary is structural, not editorial:

- **Every message is about one submission.** `IssueNotification` requires an
  `issueId`. There is no recipient list, no segment, no broadcast, and no model
  in this phase that could hold one.
- **Every template is a fixed, versioned constant in source.** There is no
  template table, no template editor, and no path from a text field to the body
  of an outbound message. The one piece of staff prose that can reach a citizen
  is a **public update**, attached to one submission, permissioned and audited.
- **Consent is per submission and single-purpose.** There is no marketing flag
  to bundle it with, because there is no marketing. There is also no cross-issue
  citizen record to attach a preference to — building one would create exactly
  the person-level profile the product refuses to keep.

Not implemented and not implementable within these models: voter prediction,
supporter or opponent classification, political profiling, persuasion scoring,
social-media analysis, targeted campaign messaging.

---

## 2. Architecture

```
  CITIZEN                                    STAFF
     │                                         │
     │ reference (+ token for writes)          │ COMMUNICATION_PUBLISH
     ▼                                         ▼
  publicIssueTimeline                   IssuePublicUpdate  (DRAFT)
  followIssue / unsubscribe                    │ publish
  submitIssueFollowUp                          ▼
     │                                  IssuePublicUpdate  (PUBLISHED)
     │                                         │
     └──────────────┬──────────────────────────┘
                    ▼
           notificationService.queue()
            · consent checked
            · daily ceiling checked
            · idempotency key (UNIQUE)
                    ▼
            notificationQueue  (in-process)
                    ▼
           notificationService.deliver()
            · consent RE-checked
            · template rendered + allow-list
                    ▼
              NotificationProvider
                 log │ smtp
                    ▼
        IssueNotification.status  SENT │ FAILED │ SKIPPED
```

---

## 3. Public tracking, and why the reference alone is still enough

Phase 5's lookup is safe with the reference alone because of *what it returns*:
six non-sensitive scalars. Phase 8 keeps that reasoning and extends the payload
with a dated timeline and the updates staff chose to publish — every one of
which is, by definition, something the organisation decided this citizen should
read.

What a citizen sees:

| Shown | Withheld |
| --- | --- |
| Reference, type, category | Their own title and description |
| Status + public status label | Priority, assignment, moderation state |
| Dated timeline of status changes | `IssueHistory.detail` (staff context) |
| Published updates | Drafts, archived updates |
| Whether follow-up is open | Internal notes, attachments, AI output |
| — | Any contact detail, staff name, or internal id |

**The timeline reuses `IssueHistory` but never its `detail` column.** Status
transitions are safe to project; the free-text beside them says things like
"Assigned to Priya". The select clause in `citizenCommunication.service.ts` is
the privacy boundary, and it lists four columns.

Unknown reference, suspended tenant and spam all return `null` — distinguishing
them would confirm to somebody guessing that a reference exists.

---

## 4. Secure tracking

A **tracking token** is issued once at submission: 32 random bytes, returned in
the receipt, with only the SHA-256 digest stored (the Phase 2 password-reset
pattern). It is not recoverable afterwards by anyone, including us.

**The split is drawn at reads versus writes**, not around the whole surface:

| Operation | Needs | Why |
| --- | --- | --- |
| Status, timeline, published updates | Reference | Disclosed information |
| Follow / change address / read settings | Reference **+ token** | Attaches contact data |
| Submit follow-up | Reference **+ token** | Writes words onto a report |

The threat this answers is concrete: with reference-only auth, anybody holding a
reference could subscribe **their own** address to a stranger's submission and
receive every later update about it, or file a "not resolved" objection in their
name.

Every verification failure — wrong token, malformed token, no token issued,
unknown reference, suspended tenant, spam — produces **one identical error**.
Tested directly.

*No expiry or rotation is implemented* (§15).

---

## 5. Public updates versus internal notes

**The central design decision of the phase.** `IssuePublicUpdate` is a separate
table rather than a `visibility` flag on `IssueHistory` or
`IssueInternalNote`.

`IssueHistory.create` is called from **six** places in `issue.service.ts`. A
visibility column there would mean every one of those paths — and every path
added later — must get the default right forever, and a single miss publishes an
internal action to a member of the public. Here there is no such failure mode:
**nothing exists in this table unless a person deliberately wrote it for a
citizen to read**, and there is no operation anywhere that converts a note into
an update.

**Lifecycle:** `DRAFT` (default) → `PUBLISHED` → `ARCHIVED`.

- **Drafting is ungated.** Writing something nobody can see is not a disclosure,
  and gating it would stop an issue handler preparing text for a colleague.
- **Publishing needs `COMMUNICATION_PUBLISH`.** It is the organisation speaking,
  and it cannot be unsaid once read. The UI shows an explicit warning first.
- **Corrections supersede; they do not rewrite.** A published update may already
  have been read and emailed. The correction is published, the original is
  archived and remains readable to staff — what a citizen was told at the time is
  exactly what a later dispute turns on.
- **Archiving withdraws from the page without deleting.**

Bodies are **plain text**, and HTML is *rejected* rather than stripped —
silently stripping invites somebody to find a form the stripper misses, and
leaves a staff member wondering where their formatting went.

---

## 6. Notifications

### Providers

`NotificationProvider` is transport-shaped for the same reason the Phase 6 AI
provider is: a per-event interface would put templates and safety rules inside
each vendor, so a second vendor reimplements them all and the "never interpolate
a phone number" rule exists in as many copies as there are providers.

- **`log`** — writes to the server log, marks `SENT`, never claims delivery.
  Production refuses it.
- **`smtp`** — **declared but not implemented.** It throws `NOT_CONFIGURED`
  rather than silently succeeding, because a stub returning success would put
  "SENT" in front of an administrator for messages nobody received. See §15.

### Templates

Five fixed templates, one per event, versioned like Phase 6's prompts.

**The variable allow-list is the control that matters.** `renderNotification`
rejects any placeholder outside `NOTIFICATION_TEMPLATE_VARIABLES`, and it checks
the *rendered output*, so a value that itself contains `{{…}}` also stops the
send. A leak of the shape "template now interpolates `{{contactPhone}}`" cannot
be introduced by editing a template alone.

Never referenced: the citizen's name, email, phone, the issue **title** or
description, staff names, internal notes, AI output. The title is excluded
deliberately — a citizen wrote it and an email subject line is the least private
place on the internet.

### Idempotency

A citizen receiving the same email three times is the most visible possible
failure here, and there are four routine ways to cause it: a client retrying a
mutation, a worker retrying after a crash, a restart re-queueing stranded work,
and a staff member pressing publish twice.

The guarantee is a **unique database constraint** on a key derived from the
*facts* of the event — issue, event type, and the thing that changed (the new
status, or the update's id). Deliberately **not** a timestamp or random value,
either of which would make every call unique and the constraint decorative. A
repeat collides and is reported as a skip, because "we already sent this" is a
success.

### Consent is re-checked at send time

Not at queue time. With a queue there is a real gap, and a citizen who
unsubscribes inside it must not receive the message already in flight. Tested.

### Retry and ceilings

- **3 attempts**, then abandoned. A message about a pothole that is three days
  late is not worth a long retry schedule, and unbounded retry against a
  misconfigured provider floods a mailbox once the configuration is fixed.
- **Manual retry** only for `FAILED` rows below the ceiling, behind
  `COMMUNICATION_SEND`. A `SENT` row is never re-sent.
- **`NOTIFICATION_MAX_PER_ISSUE_PER_DAY` (6)** — the protection a citizen
  actually needs: without it, a staff member editing a status ten times in an
  afternoon emails them ten times about one problem.

### `SKIPPED` is not `FAILED`

A skipped message is one the system correctly chose not to send — no consent,
provider unconfigured, update withdrawn before it went out. Folding those into
failures would make a healthy deployment look broken and bury the genuine
failures. Reported separately everywhere.

---

## 7. Follow-up and reopen

```
  Resolved / Closed
        │
        ▼
  "Was this resolved?"   ── RESOLVED ──────────▶ recorded
                         ── PARTIALLY ─────────▶ recorded, surfaced
                         ── NOT_RESOLVED ──────▶ reopenRequested = true
                                                        │
                                                        ▼
                                          admin reviews (FOLLOW_UP_REVIEW)
                                     REOPENED │ KEPT_CLOSED │ ACKNOWLEDGED
                                                        │
                                    (reopening the issue is a SEPARATE act
                                     through the Phase 5 status path)
```

**A follow-up records a statement; it never takes an action.** Nothing in the
table changes an issue's status, and the review decision does not either. Two
reasons that separation is worth the extra click:

1. Phase 5 status transitions have their own rules (`canTransition`), and a
   second writer bypassing them would eventually produce an illegal state.
2. A reopen is an operational commitment — somebody has to do the work again —
   and it should appear in the issue's own timeline as a decision a named person
   took, not as a side effect of a citizen tapping a button. Otherwise anybody
   holding a token could bounce a closed issue open indefinitely.

"Partially" deliberately does **not** raise a reopen request: treating it as
disagreement would put every partially satisfied citizen into a queue meant for
the genuinely unresolved.

One follow-up per submission; a second is refused rather than stacked.

---

## 8. Security

### RBAC

| Permission | Grants |
| --- | --- |
| `COMMUNICATION_READ` | See updates, messages and citizen replies |
| `COMMUNICATION_PUBLISH` | Make a message visible to a citizen |
| `COMMUNICATION_SEND` | Send and retry outbound messages |
| `FOLLOW_UP_REVIEW` | Decide what to do about a citizen's reply |

| Role | Read | Publish | Send | Review |
| --- | --- | --- | --- | --- |
| `CAMPAIGN_ADMIN` | ✓ | ✓ | ✓ | ✓ |
| `ISSUE_MANAGER` | ✓ | ✓ | ✓ | ✓ |
| `FIELD_COORDINATOR` | ✓ | — | — | — |
| `CANDIDATE` | ✓ | — | — | — |
| `CONTENT_MANAGER`, `ANALYST`, `VIEWER` | — | — | — | — |

A coordinator can see what a citizen was told (so a field visit does not
contradict it) and can draft, but cannot speak for the organisation.

### Tenant isolation

`organizationId` is derived from the verified session and written into every
`where`. Cross-tenant access returns `NOT_FOUND`, never `FORBIDDEN` — confirming
an id exists would leak that another tenant holds it. Tested for publishing,
reading, overview counts and follow-up.

### Rate limiting

Public endpoints use the Phase 2 limiter, keyed on IP (there is no account, and
keying on the reference would let an attacker rotate references *and* let them
lock a citizen out of their own submission).

| Endpoint | Default |
| --- | --- |
| Timeline lookup | 20 / 5 min |
| Subscription changes | 20 / hour |
| Follow-up | 10 / hour |

The lookup reuses Phase 5's configured `ISSUE_TRACK_*` numbers but counts in its
own bucket, so a citizen checking a status is not spending the same budget twice.

### PII protection

- The **subscription** row holds the address, because sending requires it. It is
  never returned by any query.
- The **notification** row holds only a **masked** form (`r***@example.com`) for
  the admin console. An operations dashboard needs to know a message went to the
  right sort of place, not to reproduce an address for every member of staff who
  can open it.
- **Audit metadata never carries the address, the update body, or a citizen's
  comment** — the audit log is widely readable within a tenant.

---

## 9. Audit

| Action | Actor |
| --- | --- |
| `PUBLIC_UPDATE_CREATED` / `_PUBLISHED` / `_ARCHIVED` | Staff |
| `NOTIFICATION_QUEUED` / `_SENT` / `_FAILED` / `_RETRIED` | Staff or system |
| `ISSUE_SUBSCRIPTION_CREATED` / `_STOPPED` | **null** (citizen) |
| `ISSUE_FOLLOW_UP_SUBMITTED` / `ISSUE_REOPEN_REQUESTED` | **null** (citizen) |
| `ISSUE_FOLLOW_UP_REVIEWED` | Staff |

Created and published are audited **separately**: drafting is private,
publishing is the organisation speaking. Citizen actions carry a null actor,
matching the Phase 5 `ISSUE_SUBMITTED` convention — the submitter is a member of
the public, not a user, and there is deliberately nothing to attribute it to.

---

## 10. Data model

Four new tables, two new nullable columns on `issues`, eight enums. Migration
`20260912180000_phase8_citizen_communication` — purely additive, applied with
`migrate deploy`.

| Model | Purpose |
| --- | --- |
| `IssuePublicUpdate` | Staff-authored messages, with lifecycle and corrections |
| `IssueSubscription` | Consent + destination, one per issue per channel |
| `IssueNotification` | One outbound message and its delivery state |
| `IssueFollowUp` | The citizen's answer and the staff review |

`Issue.trackingTokenHash` (unique) and `Issue.trackingTokenIssuedAt`.

Indexes follow the actual queries: the public page reads
`(issueId, status, publishedAt)`; the communication centre reads
`(organizationId, status, createdAt)`; the reopen queue reads
`(organizationId, status, reopenRequested)`.

---

## 11. Failure handling

Nothing administrative depends on the communication subsystem.
`enqueueNotification` is synchronous, returns void, catches everything, and runs
**after** the status change or publication has committed. A staff member moving
a submission to RESOLVED never sees an error because a mail provider is down.

Provider errors are **classified**, never passed through: a raw provider message
routinely echoes the recipient address and occasionally a credential fragment.
Administrators see a mapped sentence; the original goes to the server log.

---

## 12. Production configuration

```
NOTIFICATIONS_ENABLED=true
EMAIL_PROVIDER=smtp          # 'log' is refused in production
EMAIL_FROM=office@example.org
SMTP_HOST= / SMTP_USER= / SMTP_PASSWORD=
NOTIFICATION_LINK_BASE_URL=https://…
```

Startup **fails** if notifications are enabled with `log`, without
`EMAIL_FROM`, or with `smtp` and incomplete credentials. Full list in
[.env.example](../apps/api/.env.example).

---

## 13. Testing

43 tests in `apps/api/src/__tests__/communication.test.ts`, against a capturing
provider so the real service layer — templates, the allow-list, consent checks,
idempotency, delivery state — runs without a mail server.

Covered: token storage as digest only, unpredictability, single issuance,
indistinguishable rejection; public-page leakage of phone/email/name/internal
note/history detail/title; draft invisibility; timeline projecting only status
transitions; consent required, recorded and masked; token required for
subscribe and follow-up; unsupported channel refused; unsubscribe preserving
data; idempotency key derivation; duplicate suppression including a replayed
GraphQL mutation; skip-without-consent; consent re-checked after queueing;
safe failure recording; attempt ceiling; no PII in outbound messages; all five
templates; allow-list enforcement; placeholder rejection; HTML rejection;
double-publish refusal; separate audit records; follow-up gating, status
immutability, "partially" handling, one-per-issue, token requirement, admin
queue and review; RBAC across four roles; tenant isolation in four directions;
rate limiting.

---

## 14. Changes to Phases 1–7

Three, all additive:

1. `issueSubmission.service.ts` — issues the tracking token, returns it in the
   receipt, and one fire-and-forget `enqueueNotification`.
2. `issue.service.ts` — one fire-and-forget `enqueueNotification` after the
   status-change audit record.
3. `IssueSubmissionReceipt` gained `trackingToken`; `PublicIssueTimeline`
   re-exposes `type`, already disclosed by the Phase 5 lookup.

The Phase 5 `publicIssueStatus` query is **unchanged and still served** — a
client that has not been updated keeps working.

---

## 15. Known limitations

1. **SMTP is not implemented.** The adapter exists, is wired, and fails loudly
   with `NOT_CONFIGURED`. Only `log` actually delivers anywhere. This is the
   most significant gap in the phase: **no deployment can currently email a
   citizen.** The remaining work is one method and a mail dependency.
2. **SMS is declared, not built.** The enum member and delivery columns exist;
   subscribing to SMS is refused with an honest message rather than accepted
   silently.
3. **The queue is not durable.** In-process, lost on restart (`requeueStranded`
   recovers at boot), per-instance. Two instances could both pick up a row; the
   idempotency key makes that a wasted call rather than a duplicate email.
4. **It is a second queue, not a shared one.** Phase 6 introduced a *pattern*,
   not a broker. Sharing one worker pool would let a slow AI generation delay a
   citizen's email.
5. **Tracking tokens do not expire and cannot be rotated.** A lost token is lost
   permanently (status stays readable by reference); a compromised one stays
   valid. Rotation needs a re-issue path and a way to tell the citizen.
6. **No delivery confirmation.** `DELIVERED` exists but no provider in use
   reports it, so the dashboard shows `SENT`. Bounces and complaints are not
   tracked.
7. **No public attachments.** An admin cannot mark an attachment public;
   citizens see no files. Phase 5 attachments remain behind
   `ISSUE_ATTACHMENT_READ`.
8. **No AI drafting.** Deliberately not implemented — the brief made it optional
   and the safest implementation is a human writing the update.
9. **Notification preferences are per submission, not per person.** By design
   (§1), but it means a citizen with three reports sets three preferences.
10. **The admin list pages by offset**, not cursor. Correct at expected volumes;
    would drift under concurrent inserts at scale.
11. **No email verification.** A citizen can subscribe an address they do not
    own. Mitigated by the token requirement (only somebody with the submission's
    token can do it) but not eliminated.

---

## 16. What Phase 8 provides for Phase 9

- A provider seam any future channel implements without touching business logic.
- A consent model with evidenced, per-purpose records and a working stop path.
- An idempotency pattern that survives restarts and worker retries.
- A public/internal separation enforced by table structure rather than a flag.
- A citizen-facing write surface with a proven authentication mechanism.

Phase 9+ functionality is **not** implemented, and none of the political
profiling, voter prediction or targeted-messaging capability excluded from
Phases 5–8 is a permitted extension of any of it.
