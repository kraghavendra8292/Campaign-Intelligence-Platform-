# Phase 9 — Verified work, evidence and public transparency

How a claim on the public site is connected to the records behind it, who
checked them, and what the platform refuses to assert.

Companion to [CONTENT.md](./CONTENT.md) (Phase 3, which models the claims) and
[SECURITY.md](./SECURITY.md).

---

## 1. The idea the phase exists to protect

A claim, the evidence for it, the verification of that evidence, and the
publication of the result are **four different things**, potentially done by four
different people at four different times. Collapsing any two is how a
transparency system starts telling people something it never checked.

The platform already had two of the four:

| | Before Phase 9 |
| --- | --- |
| **Claim** | `Project` (a work) and `Achievement` (an accomplishment) |
| **Evidence** | `AchievementEvidence` — attachable only to an achievement |
| **Verification** | A flag on `Achievement`, set directly, with no workflow |
| **Publication** | `ContentStatus` + the entity's `_PUBLISH` permission |

Phase 9 completed the middle two rather than inventing parallel copies.

**There is deliberately no new status enum.** Publication keeps using
`ContentStatus`; verification keeps using `VerificationStatus`, to which the
phase added exactly one member, `REJECTED`.

---

## 2. What was extended, not created

The brief's instruction was to extend an existing achievement entity rather than
duplicate it. The repository already had one, so:

- **`Achievement`** gained reviewer assignment, submission tracking, a rejection
  reason, and department/agency fields.
- **`Project`** gained verification for the first time. A completed road and a
  *claim* that a road was completed are different things, and before this a
  project could read `COMPLETED` on the public site with nothing behind it.
- **`AchievementEvidence`** became **`WorkEvidence`**: attachable to either
  subject, with classification and provenance metadata.

### The table-name lag

The Prisma model was renamed to `WorkEvidence` because evidence now attaches to
a project too, and calling it `AchievementEvidence` in code would mislead every
future reader. **The table is still `achievement_evidence`** (`@@map`), because
Phase 9 was required to be additive and renaming a table is not. The mismatch is
deliberate and documented rather than hidden.

### One evidence table, not two

A discriminated subject (`achievementId` **or** `projectId`, exactly one)
rather than a second table. Two tables would mean two reviewer queues, two audit
paths and two places to get the privacy rules right.

The invariant is enforced by a **CHECK constraint in the migration**, not only in
the service — a service is one refactor away from a second write path; a
constraint is not.

---

## 3. Verification lifecycle

```
  UNVERIFIED ──submit──▶ IN_REVIEW ──verify──▶ VERIFIED
       ▲                     │                    │
       │                     └───reject──▶ REJECTED
       │                                          │
       └──────withdraw────────────────────────────┘

  Any evidence change to a VERIFIED or REJECTED claim ──▶ IN_REVIEW
```

`REJECTED` was added because without it a reviewer who found the evidence
insufficient had to set the claim back to `UNVERIFIED` — indistinguishable from
"nobody has looked yet", so the next reviewer started from scratch and whoever
submitted it was never told anything.

### What the verification service refuses to do

- **Never sets `VERIFIED` as a side effect.** Not when evidence is uploaded, not
  when a claim is published, not when an administrator creates a record, not
  when AI reads a document. The only route is a person holding the verification
  grant saying so.
- **Never touches `status`.** Verifying is not publishing. A verified claim
  still needs publishing; an unpublished claim can be verified.
- **Never rewrites history.** Every transition appends a `VerificationEvent`,
  including reversals.
- **Never verifies nothing.** Evidence is re-counted at decision time, because
  it may have been removed while the claim sat in the queue.

### A rejection must carry a reason

Required, minimum ten characters. A rejection without one is unactionable:
whoever submitted it cannot fix it, and the next reviewer cannot tell whether
the evidence was wrong, missing or simply never read. The reason is **internal**
and never reaches a public payload.

### Changing evidence reopens a decision

The rule that keeps the badge honest. Without it the attack needs no special
access: submit a claim with sound evidence, get it verified, then swap the
evidence. The badge would still read `VERIFIED` while attesting to a document no
reviewer ever saw.

"Material" is defined narrowly: the **substance** of the evidence, not its
presentation. Changing which document is attached, what it is claimed to be, or
who issued it reopens the review. Fixing a typo in a description or re-ordering
items does not — re-reviewing over a typo trains reviewers to click through.

---

## 4. Evidence

Twelve types, from `WORK_ORDER` and `COMPLETION_CERTIFICATE` to `BEFORE_PHOTO`
and `OTHER`.

**A type is a description of an artefact, not an assertion of authority.**
Recording `GOVERNMENT_ORDER` says a staff member believes the document is one;
it does not make the public badge claim government endorsement, and no code path
treats any type as self-authenticating. A forged work order and a real one are
the same value to the enum — which is precisely why a person decides
verification.

### Visibility

`isPublic` defaults to **false**. A document attached in a hurry — which is most
of them — is not a publication, and an evidence store that leaked by default
would be worse than none, because staff would stop attaching the difficult
documents.

Publishing one piece of evidence is a **separately audited** action
(`WORK_EVIDENCE_VISIBILITY_CHANGED`), because it is the only evidence edit that
is a *disclosure*: it cannot be undone for anybody who already read it.

Changing visibility deliberately does **not** reopen verification — the reviewer
saw the same document either way. What changed is who else can.

---

## 5. What the public sees

| Published | Never |
| --- | --- |
| Title, description, category, area, location | Internal notes |
| Proposed / ongoing / completed status | Rejection reasons |
| Verification status, as recorded | Reviewer or uploader identity |
| Public evidence: title, type, source, reference number, issuing authority, dates | Private evidence, in any form |
| Department and agency, when recorded | Draft or rejected claims |

Evidence is filtered **twice** on the way out: `isPublic: true` in the `where`,
and an explicit column allow-list in the `select` that omits `internalNote`.
Either alone would do today; both together mean a mistake in one is not a
disclosure.

`internalNote` is **absent from every public GraphQL type** — not filtered at
runtime but missing from the schema, so a public query cannot ask for it however
it is written.

### The badge

Says **"Verified — checked against supporting evidence by this campaign's review
process."**

It does not say "Government verified", "Officially confirmed" or "Independently
audited". The platform has no standing to make any of those claims: a reviewer
here is campaign staff reading documents the campaign itself supplied, and a
badge implying external authority would be the single most misleading thing this
product could print.

**There is no badge for unverified.** An absent badge is the honest rendering of
a claim nobody checked; a grey "not verified" chip on every card would make the
page look audited with most of the audit saying "no".

### Proposed work

Carries the most cautious visual treatment — dashed, deliberately unfinished —
because a proposal skimmed quickly on a phone must never read as something that
was built. `CANCELLED` work is excluded from every public listing entirely: it is
not a transparency claim, and showing it beside completed work invites it to be
read as one.

### Before / after

A photograph appears under "Before" only because somebody classified it that way.
The gallery never infers a pairing from upload order or filename — two
photographs under those labels is an argument about cause and effect, not a
gallery.

---

## 6. Transparency metrics

**Every number is a database count.** `count` and `groupBy`, nothing generated,
nothing estimated. A transparency page whose headline figures came from a
language model would be the precise inversion of what it claims to be, which is
why the query has no AI field to ask for.

**Evidence coverage** = published works with at least one *public* piece of
evidence ÷ published works. Public rather than any evidence, because the figure
is shown to a member of the public and has to mean something they can check: "92%
of these works have a document you can open". Counting private evidence would
produce a higher number nobody could verify.

Null, not zero, when there is nothing to divide by — Phase 7's rule: a percentage
with an empty denominator is not 0%, and printing "0%" states something false
with the confidence of a measurement.

---

## 7. Authorization

| Permission | Grants |
| --- | --- |
| `EVIDENCE_READ` | See non-public evidence, including internal notes |
| `EVIDENCE_MANAGE` | Attach, edit and remove evidence |
| `WORK_VERIFY` | Decide verification on a **project** |
| `ACHIEVEMENT_VERIFY` | Decide verification on an **achievement** (Phase 3, unchanged) |
| `VERIFICATION_REVIEW` | Work the queue: assign reviewers, see what is waiting |

| Role | Read | Manage | Verify | Queue |
| --- | --- | --- | --- | --- |
| `CAMPAIGN_ADMIN` | ✓ | ✓ | ✓ | ✓ |
| `CONTENT_MANAGER` | ✓ | ✓ | — | ✓ |
| Everyone else | — | — | — | — |

`CONTENT_MANAGER` assembles the case and cannot decide whether it holds — the
same edit-but-never-publish boundary that role already had, applied to
claim-versus-verification.

`ACHIEVEMENT_VERIFY` was kept exactly as Phase 3 defined it so no role's existing
authority changed silently. `WORK_VERIFY` is new because projects had no
verification concept at all; reusing the achievement grant would have widened
what every holder could attest to.

---

## 8. Data model

Migration `20260913000000_phase9_verified_work` — additive. Applied with
`migrate deploy`; verified 49 → 50 tables with every Phase 1–8 row count
unchanged.

- **`verification_events`** — new. Append-only history, `(subjectType, subjectId)`.
- **`achievement_evidence`** — extended: `projectId`, `organizationId`,
  `evidenceType`, `referenceNumber`, `issuingAuthority`, `issuedOn`,
  `capturedOn`, `capturedLocation`; `achievementId` made nullable; CHECK
  constraint for exactly-one-subject.
- **`projects`** — gained verification, reviewer assignment, department, agency.
- **`achievements`** — gained reviewer assignment, submission tracking,
  rejection reason, department, agency.
- **`verification_status`** — gained `REJECTED`.

`organizationId` is denormalised onto evidence so it can be tenant-filtered
without a join: every query in the module filters on it, and the join would
otherwise be the only thing between a bug and cross-tenant evidence.

One backfill: existing evidence rows took their tenant from the parent
achievement. Rows predating the phase keep `evidenceType = OTHER` — inferring a
type from a title would be the platform inventing provenance for a document
nobody classified.

---

## 9. Audit

`WORK_EVIDENCE_ADDED` / `_UPDATED` / `_REMOVED` / `_VISIBILITY_CHANGED`,
`WORK_SUBMITTED_FOR_VERIFICATION`, `WORK_REVIEWER_ASSIGNED`,
`WORK_REVIEW_STARTED`, `WORK_VERIFIED`, `WORK_VERIFICATION_REJECTED`,
`WORK_VERIFICATION_WITHDRAWN`.

**Reviewer reasoning is never placed in audit metadata.** `AUDIT_READ` is a wider
grant than `EVIDENCE_READ`, so copying a rejection reason there would route
around the permission that exists to contain it.

---

## 10. Testing

59 tests in `apps/api/src/__tests__/verifiedWork.test.ts`, plus a web suite
asserting how the page *reads* rather than how it is plumbed.

The properties under test are the ones whose failure would mislead somebody: a
badge nobody granted; private evidence readable through the API or the file
route; an internal note or rejection reason in a public payload; a draft or
rejected claim on the public site; evidence swapped under a verified claim;
proposed work presented as completed; transparency counters from anywhere but
the database; anything crossing a tenant boundary.

One bug was caught by these tests during development and is worth recording: the
material-change comparison read `documentId` off a selection that exposes the
joined `document` instead, so it compared `null` against `undefined` and marked
**every** edit material — meaning a typo fix would have reopened a verified
claim. Fixed by comparing against the values actually written.

---

## 11. Known limitations

1. **The table is named `achievement_evidence`** while the model is
   `WorkEvidence` (§2).
2. **No AI drafting or metadata extraction.** Deliberate: the brief made it
   optional and the safest implementation of a claim published in somebody's
   name is a human writing it.
3. **No evidence versioning.** Replacing a document replaces it; the previous
   file is not retained. The verification history records *that* evidence
   changed and reopens the decision, but not what it was before.
4. **No reviewer lock.** Assignment is a hint, not a lock — a hard lock would
   strand claims behind whoever is on leave, and the trail records who actually
   decided.
5. **No separation-of-duties rule.** A `CAMPAIGN_ADMIN` can submit a claim and
   verify it. The role split (content manager prepares, admin verifies) is the
   intended control, but nothing stops one person holding both.
6. **Public evidence download has no rate limit of its own**, beyond the global
   limiter.
7. **The public works listing pages by cursor; the admin evidence list does
   not page at all** — bounded by `MAX_EVIDENCE_PER_SUBJECT` (40) instead.
