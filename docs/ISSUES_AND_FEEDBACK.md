# Citizen Feedback and Issue Reporting

The Phase 5 model: how a member of the public tells the campaign something, what
is kept, who can see it, and what this system refuses to do with it. Companion
to [AUTHENTICATION.md](./AUTHENTICATION.md) (identity, tenancy, RBAC),
[CONTENT.md](./CONTENT.md) (the public site) and
[QR_CAMPAIGNS.md](./QR_CAMPAIGNS.md) (the channel a citizen may have arrived
through). Phase 5 re-implements none of them.

---

## 1. Citizen flow

```
  Poster  ──scan──▶  /q/RK-QR-…  ──302──▶  public site  (?rk_qr=RK-QR-…)
                                              │
                                              │  "Share Feedback"
                                              ▼
                                          /feedback
                                              │
   type → title → description → category → location? → photo? → contact? → consent?
                                              │
                                              ▼
                                    submitIssue (GraphQL, anonymous)
                                              │
                             rate limit → validate → tenant → write
                                              ▼
                                    ISS-2026-7F3K9XQ2
                                              │
                                              ▼
                                    /track   (status only, forever)
```

No account. No login. No cookie. The whole path from poster to reference works
for somebody who has never visited before and never will again.

**The admin side:**

```
  /admin/issues  →  triage  →  priority  →  assign  →  status  →  notes  →  resolved
```

---

## 2. The issue model

One table, `issues`, holding what a citizen said and how the campaign handled
it. Its shape follows four rules:

- **Tenant-owned.** `organizationId` on every row, and on every child table.
- **Optional by default.** Only the type, title and description are required.
  Location, photographs and contact details are all nullable.
- **Attribution, not profile.** `source`, `campaignId` and `qrCodeId` say which
  channel worked. Nothing says anything about the person.
- **No column can hold a political attribute**, and none may be added. There is
  no score, no affiliation, no supporter field, and no inference drawn from what
  somebody chose to report.

Children: `issue_attachments`, `issue_history`, `issue_internal_notes`, each
`organizationId`-scoped in its own right rather than relying only on the parent.

---

## 3. Categories

A **table**, not an enum — `issue_categories`, keyed `(organizationId, key)`.

Fourteen defaults are seeded per organisation (roads, water, drainage,
electricity, sanitation, healthcare, education, transport, public safety,
agriculture, employment, government services, environment, other), each with a
Kannada label, because the public site is bilingual and an English-only dropdown
on a Kannada page is where somebody gives up.

Deactivating a category hides it from the **public form** but leaves it on
historical submissions and in admin filters, so a report filed last month still
shows a category rather than a blank.

New organisations receive the defaults **at creation time**, in the same
transaction. A tenant without a category vocabulary has a broken feedback form
from the moment it exists, so this is not left to a later seed run.

---

## 4. Statuses

```
SUBMITTED ─▶ UNDER_REVIEW ─▶ ACKNOWLEDGED ─▶ IN_PROGRESS ─▶ RESOLVED ─▶ CLOSED
     │             │               │              │            │
     └─────────────┴───────────────┴──────────────┴────────────┴──▶ REJECTED
                                                                CLOSED ─▶ IN_PROGRESS
```

Transitions are **enumerated**, not free-form. A submission cannot jump from
`SUBMITTED` straight to `CLOSED`, because that skips the acknowledgement a
citizen is waiting for. The admin UI builds its buttons from the same map, so an
invalid move is not something the interface can even ask for.

`CLOSED → IN_PROGRESS` is deliberately allowed: "we thought this was fixed and
it was not" is a real situation, and making the citizen re-report it would lose
the history.

`resolvedAt` and `closedAt` are stamped once and preserved, so a reopened and
re-resolved report keeps its original resolution date.

---

## 5. Priorities

`LOW` · `MEDIUM` · `HIGH` · `URGENT`. Administrative triage, always set by a
person who has read the submission.

**Phase 5 does not infer priority** — not from keywords, not from a model, not
from who reported it. An automatically escalated complaint is an unaccountable
decision; the point of this field is that somebody owns it.

---

## 6. Reference numbers

```
ISS-2026-7F3K9XQ2
└┬┘ └─┬┘ └───┬──┘
 │    │      └── 8 random characters from a 32-character alphabet
 │    └───────── year, so age is obvious at a glance
 └────────────── FB / ISS / SUG / CMP by submission type
```

**Random, not sequential.** A zero-padded counter would read more nicely but
would let anyone walk the range, learn how many submissions a campaign has
received, and — if tracking ever widened — read other people's reports. It also
leaks volume to a competitor.

The alphabet omits I, L, O and U so a reference read aloud over the phone cannot
be mistranscribed. Generated with `crypto.randomInt`; the database's unique
index is the real guarantee, and allocation retries on collision rather than
surfacing one to a citizen as a failed submission.

The internal UUID is never exposed publicly.

---

## 7. Anonymous submissions

Anonymous is the **default**, and the checkbox is pre-ticked.

When a submission is anonymous the server **clears** the contact fields rather
than trusting the client to have cleared them. A form bug that left a phone
number in a hidden field would otherwise store personal data the citizen
believed they had withheld. There is a test for exactly that.

---

## 8. Optional contact details

Name, phone and email — each optional, each only stored if volunteered.

Validation is deliberately permissive. A citizen mistyping their address loses
the reply; a citizen rejected by an over-strict pattern loses the whole
submission, and real addresses routinely defeat clever regular expressions.
Phone accepts digits and the usual punctuation, 6–20 digits, with no
country-specific rule.

**Never collected, by policy:** Aadhaar, voter ID, PAN, passport, any government
identifier, political affiliation or political preference. There is no field for
any of them.

### Consent

Required **only where there is personal data to consent to**. Demanding a tick
from an anonymous reporter would be theatre. When contact details are given,
`consentGiven` and `consentAt` are recorded together, so the basis for holding
them is evidenced rather than assumed.

Consent covers replying to *this submission*. It is not a basis for anything
else, and certainly not for profiling.

---

## 9. Attachments

| | |
|---|---|
| Accepted | JPEG, PNG, WebP, GIF, PDF |
| Rejected | JS, HTML, SVG, executables, and anything whose bytes disagree with its claim |
| Size | 5 MB per image, 10 MB per document |
| Count | 5 per submission |

**Content decides the type.** The declared MIME and the filename are both
attacker-controlled; the magic bytes are checked first and the declared type and
extension must then agree. SVG is excluded despite being an image: it is an XML
document that can carry `<script>`.

Phase 5 uses the Phase 3 validator and adds a **tighter ceiling** — a citizen is
on mobile data next to a pothole, not at a desk.

**Filenames never become paths.** The storage key is a generated UUID under a
per-tenant prefix; `../../../../etc/passwd.png` survives only as display text.
There is a test asserting exactly that.

### Why upload is a separate step

A 5 MB photograph cannot travel through a GraphQL mutation — the body limit is
256 KB. So the browser uploads first to `POST /public/issue-attachments` and
receives an id plus a **claim token**, then names both in `submitIssue`. The
token is what stops one anonymous visitor stapling another visitor's photograph
— possibly of their home — to their own report by guessing an id. It is cleared
once used, so a captured token cannot be replayed.

An attachment that fails to verify is **dropped silently** rather than failing
the submission: the words are worth more than the picture.

### Attachments are never public

Phase 3 media is world-readable because it backs `<img>` on a public site. These
are photographs of somebody's street. They are served **only** from
`GET /issue-attachments/:id`, which requires authentication,
`ISSUE_ATTACHMENT_READ` and the owning tenant, and responds
`Content-Disposition: attachment` with `Cache-Control: private` so nothing
renders in the site's origin or lands in a shared cache. An upload that was
never claimed belongs to nobody and is not served at all.

---

## 10. Moderation

`PENDING_REVIEW` → `APPROVED` / `REJECTED` / `SPAM`.

Separate from `status` on purpose. Status is about the **problem** ("is the
drain fixed?"); moderation is about the **submission** ("is this a real report,
or abuse?"). Conflating them would make rejecting spam and closing a fixed
pothole the same act.

Everything arrives `PENDING_REVIEW`. Nothing is auto-approved, and nothing is
auto-classified as spam — **there is no automated moderation in Phase 5**, and
no classification of the person who submitted.

A submission marked `SPAM` disappears from public tracking, returning the same
null as an unknown reference.

---

## 11. Assignment

One field, `assignedToUserId`, plus assign / reassign / unassign.

The assignee is verified to be an **active member of the same organisation**
before the write. Without that check a valid user id from another tenant would
hand somebody outside the campaign a queue of its citizens' reports — a
cross-tenant leak dressed up as an ordinary assignment.

This is assignment, not workforce management. There are no volunteer profiles,
tasks, attendance or scheduling in Phase 5.

---

## 12. Internal notes

Free text written by staff, behind two separate permissions — `ISSUE_NOTE_READ`
to see them and `ISSUE_NOTE_CREATE` to add one.

**Never public.** Not on the public site, not in the tracking response, and not
in the issue timeline: the note *body* is deliberately excluded from the history
entry, because staff write candidly and the timeline is read more widely than
the notes themselves.

---

## 13. Issue history

`issue_history` is the operational timeline shown on the issue page, recording
submission, status and priority changes, assignment, recategorisation,
moderation and note additions.

It is **separate from the Phase 2 audit log**, and both are written. The audit
log is a security record read by administrators; this is a working record so
whoever picks the case up next can see what has already been tried.

The opening entry — the citizen's own submission — has a **null actor**. A
member of the public is not a user, and there is deliberately nothing to
attribute it to.

---

## 14. QR attribution

The Phase 4 redirect appends `rk_qr=<code>` to the destination. The site shell
stores it in `sessionStorage` for that tab, and the feedback form sends it with
the submission.

Session scope matters: it is forgotten when the tab closes and never follows
anybody between visits. The code is validated against the **same tenant** before
use, so a code from another organisation yields no attribution rather than
cross-linking two campaigns' data — and attribution failure is never an error,
because the submission matters more than knowing which poster it came from.

The QR **symbol is unchanged**; this is the destination query string, so codes
already printed keep working.

This records **which poster worked**. It is never used to characterise the
person who scanned it.

---

## 15. Privacy

### Collected

Everything the citizen typed, plus the coordinates only if they tapped "use my
current location".

### Not collected

No IP address is ever written to a submission — it is consumed by the rate
limiter and discarded. No browser fingerprint, no device identifier, no tracking
cookie, no cross-visit identifier, and none of the government identifiers listed
in §8.

### Never inferred

No political preference, affiliation, voting intention, supporter or opponent
status, or any score derived from what somebody reported, where they live, which
poster they scanned, or anything else. This is enforced three ways: there is no
column that could hold one, no permission that could expose one, and an RBAC
test asserting that no permission matching `SUPPORTER_`, `VOTER_` or
`PROFILING_` exists.

### Geolocation

`getCurrentPosition` is called from one click handler and nowhere else. Nothing
is watched, nothing is read on page load, and the browser prompt is always the
direct result of a deliberate tap. There is a test asserting that rendering the
page triggers no prompt.

### The three separate disclosures

Reading a submission, reading the citizen's phone number, and reading a
colleague's candid note are three different disclosures about three different
people. They are three separate permissions, and `ISSUE_CONTACT_READ` in
particular is held by only two roles.

Contact details are **redacted in the mapper**, not at each call site, so a new
query cannot forget. `contactProvided` still tells a triager that a reply is
possible — what they actually need — without telling them the number.

### The one audited read

Opening a citizen's contact details is a **mutation**, `revealIssueContact`, and
it writes an audit record. Every other read on this platform goes unlogged, but
this is personal data volunteered for one narrow purpose, and it should leave a
trace. The number itself never enters the audit row, and the admin UI shows a
button rather than the number so that reading it is a decision.

---

## 16. Public tracking

`/track`, and `publicIssueStatus(referenceNumber)`.

**Returned:** reference, type, category label, status, submitted date, updated
date. Six fields, exhaustive by construction.

**Not returned, whatever the query:** the title and description — the citizen
wrote them and sometimes fills them with personal circumstances, so somebody who
found a reference on a dropped note must not read them back. Nor contact
details, internal notes, staff assignments, attachments, moderation state,
priority, or the internal id.

Priority is withheld specifically: it is an internal triage judgement, and
telling a citizen their report is "LOW" would be discouraging and none of the
platform's business to volunteer.

`PublicIssueStatus` is a **separate GraphQL type** from `AdminIssue`, not a
subset of it. Asking for a private field is a schema error, not a redaction.

Unknown, malformed, suspended-tenant and spam all return the same `null`, so the
endpoint cannot confirm that a reference exists.

---

## 17. Tenant isolation

Every admin query filters on the organisation resolved from the authenticated
session, **in the `where` clause** rather than checked afterwards — a filter
cannot be forgotten the way a post-hoc comparison can. A cross-tenant id returns
`NOT_FOUND`, not `FORBIDDEN`, so the error is not an enumeration oracle.

Public submissions resolve the tenant from the **public site being viewed**
(slug, header or host), never from a client field that could name a different
organisation.

Notes, history and attachments are each scoped through their parent *and* carry
their own `organizationId`.

---

## 18. Rate limiting and spam protection

| Endpoint | Default budget |
|---|---|
| `submitIssue` | 10 per IP per 10 minutes |
| `POST /public/issue-attachments` | 30 per IP per 10 minutes |
| `publicIssueStatus` | 20 per IP per 5 minutes |

Submission limits are deliberately loose: a household, a classroom or an
internet cafe behind one NAT must never be blocked, so they stop scripts rather
than neighbours. Tracking is much tighter — the reference space is already too
large to brute force, and this makes the attempt not worth starting.

Limits are checked **first**, before validation or any database work, so a flood
is shed cheaply. Alongside them: length ceilings on every text field, a cap of
five attachments, magic-byte file validation, and the 256 KB body limit.

**No CAPTCHA.** It is friction for every legitimate citizen — disproportionately
for older and less confident users — in exchange for stopping an attacker who
would solve it anyway. The measures above were judged sufficient for Phase 5.

The limiter store is in-memory, matching every other limiter in the platform:
correct for one process, and the single thing to swap for a multi-instance
deployment.

---

## 19. Data retention

| Question | Answer |
|---|---|
| What is collected | §15 |
| Why | So the campaign can respond to what citizens report |
| Who can see it | Staff with the relevant permission, within the tenant |
| Contact details | Only with `ISSUE_CONTACT_READ`, and every access is audited |
| Attachments | Only with `ISSUE_ATTACHMENT_READ`, never public |
| How long | Not yet automated — see below |

**Phase 5 runs no retention or deletion job.** Submissions, attachments, notes
and history persist until deleted manually, and unclaimed uploads are not swept.
This is stated as a known limitation in §20 rather than presented as
implemented.

What exists today: deleting an organisation cascades to every issue, attachment,
note and history row; removing a user nulls their authorship rather than
destroying the record. A future retention task would most sensibly age out
attachments first, then contact details on closed submissions, keeping the
aggregate counts — the schema supports that, and nothing in it would have to
change.

---

## 20. Known limitations

Recorded so they are chosen, not discovered.

- **No retention job.** Nothing prunes old submissions, contact details or
  unclaimed uploads (§19).
- **No notification.** A citizen who gives an email or phone number is told the
  team *may* contact them; no message is sent automatically. No notification
  infrastructure exists in the platform, and Phase 5 did not build one. The
  copy is careful not to promise otherwise.
- **No admin-side submission.** Staff cannot log an issue phoned in by a
  citizen; everything arrives through the public form. `ISSUE_CREATE` was
  deliberately not added rather than shipping an unused permission.
- **No duplicate detection.** Two people reporting the same pothole create two
  submissions. Nothing merges them, by design — automated merging of citizen
  reports is not something Phase 5 should decide.
- **No map.** Location is text fields plus optional coordinates from a
  deliberate tap. There is no map picker, no heatmap and no geospatial
  clustering.
- **Coordinates are stored but not displayed on a map**, only as numbers.
- **No attachment thumbnails or previews.** Files download; they do not render.
- **No category management UI.** Categories can be activated and deactivated
  through the API (`setIssueCategoryActive`), but Phase 5 ships no screen for
  it, and new categories require a seed or a migration.
- **No SLA or due dates.** Nothing tracks how long a submission has been open
  beyond its timestamps.
- **Search covers the reference and title only**, never the description — a free
  text search across what citizens wrote would turn the inbox into a way to find
  people by whatever personal detail they happened to mention. This is a
  deliberate restriction, not a gap.
- **Rate limiting is per process.**
- **The public form's category list is not cached**, so it is fetched on every
  visit to `/feedback`.

---

## 21. Permanently out of scope

Not "a later phase" — never, by product policy.

- Determining whether a citizen supports, opposes or is undecided about anybody
- Support scores, opponent scores, political affinity, voting-intention
  prediction, or any individual political profile
- Inferring political belief from a submission, a location, a category, a QR
  scan, a device or any prior activity
- Voter identification or voter profiling
- Face recognition
- Scraping Instagram, Facebook, ShareChat, X, YouTube or any other platform
- Collecting social-media likes, followers or individual behaviour
- Joining citizen submissions with external personal data
- AI summarisation, sentiment analysis, automated categorisation, automated
  moderation or automated duplicate detection of citizen submissions

Citizen submissions are **communication records**. A person who wrote to the
campaign about a blocked drain has told the campaign about a drain.
