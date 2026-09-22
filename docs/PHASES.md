# Implementation phases

The ten phases of the RK Campaign Intelligence Platform.

**Phases 1 to 10 are implemented**, which completes the numbered roadmap. Three
displaced items remain outstanding and are listed below the numbered phases.

Phase 10 delivered production hardening, security, observability and the
operational documentation. It deliberately did NOT deliver the SaaS commercials
or the scaling infrastructure that the original sketch bundled under the same
number - see that section for what was cut and why.

> **Numbering change.** AI issue intelligence was originally planned as Phase 8,
> with an admin command centre at Phase 6. It was commissioned and built as
> **Phase 6**, and is recorded under that number below. Citizen engagement and
> public communication was then commissioned as **Phase 8**, displacing the
> command centre a second time. Verified work and public transparency was then
> commissioned as **Phase 9**, displacing the React Native application. None of
> the displaced work has been renumbered; the command centre, the issue map and
> the mobile application all remain outstanding and are listed below the
> numbered phases.

| Phase | Title                                     | Status         |
| ----- | ----------------------------------------- | -------------- |
| 1     | Foundation & Architecture                 | **Complete**   |
| 2     | Authentication, Multi-Tenancy & RBAC      | **Complete**   |
| 3     | Public Candidate Website + CMS            | **Complete**   |
| 4     | QR Campaign Platform                      | **Complete**   |
| 5     | Citizen Feedback & Issue Reporting        | **Complete**   |
| 6     | AI Issue Intelligence & Summarization     | **Implemented**|
| 7     | Decision Analytics & Geographic Intelligence | **Implemented** |
| 8     | Citizen Engagement & Public Communication | **Implemented**|
| 9     | Verified Work & Public Transparency       | **Implemented**|
| 10    | Production Hardening, Security & Launch Readiness | **Implemented** |

---

## Phase 1 — Foundation & Architecture ✅

Establish a production-ready technical foundation that later phases extend
without architectural rewrites.

**Delivered**

- npm-workspaces monorepo; modular-monolith API
- React 19 + Vite web app with routing, layouts and placeholder routes
- Express 5 + Apollo Server 5 GraphQL API with a `health` query
- PostgreSQL 17 via Docker; Prisma 7 schema, migration, seed, reset
- React Native (Expo) shell with navigation, theming and configuration
- Centralised design tokens; reusable UI primitives
- Structured logging, redaction, correlation ids
- Centralised HTTP and GraphQL error handling
- Security foundations: headers, CORS allow-list, body limits, rate limiting,
  startup environment validation
- Testing foundation, ESLint, Prettier, strict TypeScript, CI, documentation

**Explicitly excluded** — authentication, every business module, AI, analytics,
payments, notifications, deployment.

---

## Phase 2 — Authentication, Multi-Tenancy & RBAC ✅

The gate every later phase depends on. Nothing that handles real campaign or
citizen data ships before it.

**Delivered**

- Argon2id password hashing, policy and change flow
- Login, logout, single-use password reset, staff invitations
- Rotating refresh-token sessions with replay detection and revocation
- Tenant resolution into `GraphQLContext.auth`, validated against memberships
- Eight roles, twenty permissions, permission-based authorization
- Privilege-escalation guards (rank, self-targeting, platform scope)
- Organisation and campaign management; user and membership administration
- Append-only audit trail with metadata sanitisation
- Admin web authentication (login, route guard, session restore, logout)
- React Native authentication on platform secure storage
- 176 tests including eleven adversarial security scenarios

**Deviation from the original sketch:** authorization is enforced in a central
service (`requirePermission`) rather than through `@auth` / `@hasRole` schema
directives. Directives read well but hide the check from the call site and are
easy to omit silently on a new field; an explicit service call keeps every
authorization decision greppable and unit-testable. The directive folder
remains for Phase 3+ if a declarative layer is wanted on top.

**Exit criteria met:** no resolver reads or writes tenant data without an
authenticated, permission-checked, tenant-scoped context.

See [AUTHENTICATION.md](./AUTHENTICATION.md) for the full security model.

---

## Phase 3 — Public Candidate Website + CMS ✅

The public face of a campaign, and the console its staff use to run it. Built
entirely on the Phase 2 identity layer: no new authentication, no new tenancy
mechanism, no new authorization path.

**Delivered**

- 17 content tables, every one keyed `(organizationId, slug, locale)`
- Publishing workflow: `DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED`, held
  separately from domain status (a project's progress) and from verification
  (whether a claim has been substantiated)
- Public site: homepage, work, vision, achievements, news, events, gallery,
  about, contact, search, privacy, terms, plus detail pages and a 404
- CMS: lists and editors for projects, achievements, news, events, priorities,
  gallery, media, and the candidate/vision/contact singletons
- 28 generated CMS permissions plus 5 specials — editing is separable from
  publishing, so an editor can prepare work they cannot make public
- Media library with magic-byte validation (the declared MIME type and the file
  name are both ignored); SVG is not accepted
- Rich text sanitised on write against an allow-list
- English and Kannada throughout: interface strings, public content, and CMS
  authoring

**The publishing boundary**

One function, `publicScope()`, pins every public read to
`{ organizationId, locale, status: 'PUBLISHED' }`. There is no second path to
public content, so "could an unpublished row be served?" has one place to look
rather than one per resolver.

**Translations are rows, not fields**

The Kannada version of a project is a separate record sharing its slug. That
keeps publishing independent per language: a translation can sit in draft while
the original is live, and each has its own status. The CMS therefore has an
editing-language switch rather than paired fields on one form.

**Exit criteria met:** unpublished content is unreachable publicly by listing or
by direct slug, in either language; no tenant's content appears on another
tenant's site; publishing requires the entity's publish permission.

---

## Phase 4 — QR Campaign Platform ✅

Measuring which outreach channels actually bring people to the public site.
Built on the Phase 2 identity layer and pointing at the Phase 3 website: no new
authentication, no new tenancy mechanism, no duplicated public content.

**Delivered**

- 3 content tables (`QrCampaign`, `QrCode`, `QrScanEvent`) and 6 enums
- Public redirect `GET /q/:code` — anonymous, no cookie, no interstitial
- Campaign lifecycle (`DRAFT → ACTIVE → PAUSED → COMPLETED → ARCHIVED`) and
  code lifecycle (`ACTIVE → PAUSED → ARCHIVED`), deliberately independent
- Server-rendered QR assets: PNG, SVG and an A4 print sheet
- Aggregate analytics: trend, and breakdowns by code, source, area, ward,
  device, day of week and time-of-day bucket
- Date presets plus a bounded custom range; aggregate CSV export
- 10 generated QR permissions, splitting viewing from analytics from lifecycle
- Demo seed: two fictional campaigns, seven codes, synthetic scan history

**The redirect never waits for analytics**

The scan write is started and not awaited, and every failure inside it is
caught and logged. A citizen holding a phone up to a poster reaches the website
whatever state the analytics pipeline is in. That is the property the tests
protect most carefully.

**No delete, only archive**

A printed QR code cannot be un-printed. Removing the row would turn every
physical poster into a dead link, so `ARCHIVED` is the only retirement path and
a retired identifier keeps resolving to an explanation forever.

**Privacy constraint, as implemented**

Scans are counted and aggregated. No IP address, raw User-Agent or referrer URL
is ever stored; the only per-visit value is a salted hash that rotates daily and
cannot be linked across days, campaigns or to any identity. No individual is
identified, tracked across campaigns, or profiled — and the data model has no
column that could hold a political preference, affiliation or supporter status.

**Exit criteria met:** an active code redirects and is counted; a paused or
archived one does neither; no campaign, code, scan or aggregate crosses a tenant
boundary; unsafe destinations cannot be stored; and analytics failure does not
block a redirect.

See [QR_CAMPAIGNS.md](./QR_CAMPAIGNS.md) for the full model.

---

## Phase 5 — Citizen Feedback & Issue Reporting ✅

A structured way for members of the public to tell the campaign something, and
for the campaign to handle what arrives. Built on the Phase 2 identity layer,
served through the Phase 3 public site, and attributed to the Phase 4 channel
the citizen came through.

**Delivered**

- Public `/feedback` form: four submission types, fourteen seeded categories,
  optional location, optional attachments, optional contact details
- Anonymous by default; contact details are an opt-in with recorded consent
- Human-friendly reference number (`ISS-2026-7F3K9XQ2`), random rather than
  sequential so the space cannot be walked
- Public `/track`: status by reference, and six fields only
- Admin inbox with server-side filtering, search and paging; detail page with
  status workflow, priority, assignment, moderation, internal notes and timeline
- Aggregate analytics by status, category, ward, source, type and priority
- 12 issue permissions separating viewing from contact details from staff notes
- 5 tables, 6 enums, additive migration

**The citizen never has an account**

No login, no cookie, no persistent identifier. The whole path from poster to
reference works for somebody who has never visited before and never will again,
and the reference is the only thing they have to keep.

**Three separate disclosures, three separate permissions**

Reading a submission, reading the citizen's phone number, and reading a
colleague's candid note are different disclosures about different people.
`ISSUE_CONTACT_READ` is held by two roles, contact details are redacted in one
central mapper rather than per call site, and revealing them is a mutation that
writes an audit record.

**Privacy constraint, as implemented**

No IP address, browser fingerprint or cross-visit identifier is stored against a
submission. No political preference, affiliation, voting intention or supporter
status is recorded, scored or inferred — there is no column that could hold one,
no permission that could expose one, and a test asserting that no `SUPPORTER_`,
`VOTER_` or `PROFILING_` permission exists.

**Exit criteria met:** a citizen can report anonymously and check the status
later; staff can triage, assign, note and resolve; nothing crosses a tenant
boundary; contact details, notes and attachments each need their own permission;
and unsafe files cannot be stored.

See [ISSUES_AND_FEEDBACK.md](./ISSUES_AND_FEEDBACK.md) for the full model.

### Original scope


- Voluntary citizen feedback submission
- Constituency issue reporting with category, description, photo and location
- Issue lifecycle: submitted → acknowledged → in progress → resolved → closed
- Assignment to campaign staff; status history
- Citizen-facing status lookup by reference
- Abuse protection: rate limiting, validation, moderation queue

**Privacy constraint:** the minimum personal data necessary, explicit consent,
clear retention. No covert collection.

---

## Phase 6 — AI Issue Intelligence & Summarization ✅

Turning the Phase 5 backlog into something an administrator can read, without
letting a model make any decision. Built on the Phase 2 identity layer and the
Phase 5 issue tables: no new authentication, no new tenancy mechanism, and no
change to how a citizen submits anything.

Full detail: [PHASE_6_AI_INTELLIGENCE.md](./PHASE_6_AI_INTELLIGENCE.md).

**Delivered**

- 6 derived tables (`IssueAiInsight`, `IssueAiTopic`, `IssueTheme`,
  `IssueThemeMembership`, `AiExecutiveSummary`, `AiUsageLog`) and 4 enums
- Provider abstraction with OpenAI and mock adapters; the mock runs the whole
  console and the entire test suite without a key or a network call
- Per-issue summary, subject-matter topics and a category suggestion
- Similar-submission suggestions with no vector infrastructure
- Aggregate themes and period executive summaries written from
  backend-computed statistics
- Human review throughout: approve, edit, reject, regenerate
- 5 AI permissions; tenant-scoped generation budgets
- Admin AI console at `/admin/ai-insights` and a panel on each submission
- 45 tests covering privacy, injection, hallucination, RBAC and isolation

**AI output is never authoritative**

`Issue.title`, `Issue.description` and `Issue.categoryId` are untouched by every
code path in the phase. Accepting a suggested category calls the ordinary Phase 5
update service *as the administrator*, so it is audited and appears in the issue
history exactly as a manual edit — the AI never becomes the actor.

**Citizen submission never depends on AI**

The integration is one fire-and-forget call made after the submission has
committed. There is no state of the AI subsystem, including complete absence,
that can fail or slow a member of the public reporting a problem.

**What this phase refuses to do**

No voter prediction, supporter/opponent classification, political affiliation
inference, individual profiling, social-media analysis or targeted persuasion.
Enforced by the data model (nowhere to store it), the prompts, a banned-term
screen on model output, and a GraphQL schema that cannot express it.

**Exit criteria met:** a citizen's contact details never reach a provider;
output classifying people politically is rejected rather than stored; a model
cannot introduce an unverified statistic without it being flagged; no AI data
crosses a tenant boundary; a provider outage leaves submission unaffected.

---

## Phase 7 — Decision Analytics & Geographic Intelligence ✅

Turning Phase 5 submissions, Phase 6 AI output and Phase 4 channel data into a
dashboard an administrator can act on. Built on all three: no new issue model,
no new AI architecture, no new scan tracking.

Full detail: [PHASE_7_ANALYTICS.md](./PHASE_7_ANALYTICS.md).

**Delivered**

- Decision dashboard at `/admin/analytics` with nine sections
- One shared filter/scope layer, so every metric on the page agrees
- Overview, trend, category/status/priority breakdowns with period comparison
- Geographic rollup by ward, locality or area; area detail; attention rankings
- Resolution performance: time-to-resolution, backlog aging, slow categories
- High-priority backlog worklist
- Phase 6 theme and topic analytics, recounted inside the current filter
- Phase 4 channel attribution and per-campaign conversion
- Evidence-backed insight cards, generated from figures rather than by a model
- Filters persisted in the URL, so a narrowed view is a shareable link
- Aggregate CSV export behind its own permission, audited
- 2 indexes, 1 new permission, 16 GraphQL queries, 44 tests

**Every number comes from the database**

No issue rows reach the browser. Every figure is a `count` or `groupBy`, and the
one place a model contributes anything is the wording of a theme summary, set
apart from the counts beside it.

**`null` is not zero**

A rate with an empty denominator, a change from an empty period and an average
with no samples all render as an em dash. A dashboard that prints "0%" when it
means "no data" is stating something false with the confidence of a measurement.

**What this phase refuses to do**

No voter prediction, supporter or opponent classification, political profiling,
individual scoring, coordinate plotting or social-media analysis. The geographic
module never reads latitude or longitude, and no type in the phase can hold a
score or a likelihood about a person.

**Exit criteria met:** every metric responds to every filter; the area table
sums to the overview headline; period comparisons use equal-length windows; no
tenant can see another's counts, areas, themes or exports; exports carry no
citizen personal data; undefined rates render as "—" rather than 0%.

---

## Phase 8 — Citizen Engagement, Issue Follow-Up & Public Communication ✅

The first phase in which the platform speaks to a member of the public rather
than only listening to them. Built on the Phase 2 identity layer and the Phase 5
issue tables: no new authentication, no new tenancy mechanism, and no change to
how a citizen submits anything.

Full detail: [PHASE_8_COMMUNICATION.md](./PHASE_8_COMMUNICATION.md).

**Delivered**

- 4 tables (`IssuePublicUpdate`, `IssueSubscription`, `IssueNotification`,
  `IssueFollowUp`), 8 enums, 2 columns on `issues`; additive migration
- Secure tracking tokens — 32 random bytes issued once at submission, stored as
  a SHA-256 digest only, returned in the receipt and never recoverable again
- Public issue timeline and published-update feed on `/track`
- Public updates with a `DRAFT → PUBLISHED → ARCHIVED` lifecycle and
  supersede-style corrections
- Notification pipeline: provider abstraction, five fixed templates, consent
  checks, idempotency, retry ceiling and a per-issue daily ceiling
- Per-submission consent with a working unsubscribe path
- Follow-up on resolved submissions, and a staff reopen-review queue
- Communication centre at `/admin/communications` and a panel on each submission
- 4 permissions separating reading from publishing from sending from reviewing
- 43 tests covering privacy, token security, consent, idempotency, RBAC,
  tenant isolation and rate limiting

**Public and internal are separate tables, not a flag**

`IssueHistory` is written from six call sites in the issue service. A
`visibility` column there would mean every one of those paths — and every path
added later — must get the default right forever, and a single miss publishes an
internal action to a member of the public. Nothing exists in `IssuePublicUpdate`
unless a person deliberately wrote it for a citizen to read, and no operation
converts a note into an update.

**Reference reads, token writes**

The Phase 5 reference alone still returns status and timeline, because those are
things the organisation chose to disclose. Attaching an email address or writing
words onto somebody's report needs the tracking token as well — otherwise anybody
holding a reference could subscribe their own address to a stranger's submission
or file an objection in their name. Every verification failure, whatever its
cause, returns one identical error.

**Administrative actions never depend on the message going out**

Queueing is synchronous, returns void, catches everything, and runs after the
status change has committed. There is no state of the notification subsystem,
including complete absence, that can fail a staff member resolving an issue.

**What this phase refuses to do**

No campaign marketing, newsletters, persuasion messages, donation or vote
requests, and no targeted messaging. Every message is scoped to one submission
by the data model, every template is a fixed constant in source, and consent is
per submission and single-purpose — there is no recipient list, no segment, and
no cross-issue citizen record to build one from.

**Not delivered:** the SMTP adapter is declared and wired but not implemented, so
no deployment can currently email a citizen; SMS is an enum member with no
provider; the queue is in-process and non-durable. See
[PHASE_8_COMMUNICATION.md §15](./PHASE_8_COMMUNICATION.md) for the full list.

**Exit criteria met:** an internal note cannot become visible to a citizen; a
public update is visible only after an explicit, permissioned, audited publish;
tracking tokens are unpredictable and stored as digests; no citizen email, phone
or staff detail appears in any public payload or outbound message; consent is
re-checked at send time; duplicate sends are suppressed by a unique constraint;
nothing crosses a tenant boundary.

---

## Phase 7 (original plan) — Issue Intelligence & Map

The mapping half of the original Phase 7 is **not** delivered. The platform
stores no boundary data, so the geographic work shipped as ranked area analytics
rather than a choropleth — see
[PHASE_7_ANALYTICS.md §5](./PHASE_7_ANALYTICS.md) for why, and what a future map
would replace.

> The **Admin Campaign Command Center** originally planned as Phase 6 is still
> outstanding and is now unnumbered — see below.

- Geographic issue map with clustering and heat density
- Ward/constituency boundary overlays
- Category and time-window filtering
- Trend detection: emerging clusters, recurring locations
- Resolution performance by area and category

---

## Unscheduled — Admin Campaign Command Center

Originally planned as Phase 6, then listed as Phase 8; deferred twice, first
when AI issue intelligence was commissioned in its place and again when citizen
communication took the Phase 8 slot. Not started, and no longer holds a number.

Parts of it have since arrived elsewhere: the Phase 7 decision dashboard covers
the reporting, and the Phase 3 CMS and Phase 2 administration cover content and
staff management. What remains is mainly queue ergonomics.

- Dashboard: open issues, resolution times, engagement volume
- Issue queues with filtering, bulk actions and SLA visibility
- Content management surfaces for Phase 3 types
- Staff and role administration
- Aggregate engagement reporting and exports

**Hard constraints:** no political profiling; no supporter/opponent scoring; no
individual-level inference; a human reviews anything published. These apply to
every phase and are already enforced in code by Phase 6.

---

## Phase 9 — Verified Work, Evidence & Public Transparency ✅

Making every public claim traceable to the records behind it. Built on the
Phase 3 content model and the Phase 2 identity layer: no new claim entity, no
new publishing mechanism, no new tenancy.

Full detail: [PHASE_9_VERIFIED_WORK.md](./PHASE_9_VERIFIED_WORK.md).

**Delivered**

- Evidence as first-class data: classification, document provenance (reference
  number, issuing authority, date), photograph capture metadata, and per-item
  public/internal visibility defaulting to internal
- A verification workflow — submit, assign, verify or reject with a required
  reason, withdraw — with an append-only `VerificationEvent` history
- Verification extended to development projects, which had none
- Public works listing at `/work` with server-side status, category, area, year,
  verified-only and text filters; work detail with a progress timeline and an
  evidence gallery grouped before / during / after
- Public transparency page at `/transparency`: database-derived counters,
  evidence coverage, category breakdown and recently verified work
- Verification console at `/admin/verification` with an oldest-first queue
- 4 new permissions, 1 new table, 23 new columns, 3 new enums, 1 database CHECK
  constraint, additive migration
- A media access gate closing a real pre-existing hole (see below)
- 59 API tests and 15 web tests

**Claim, evidence, verification and publication stay four separate things**

A `COMPLETED` work is not a verified work. Verifying does not publish, and
publishing does not verify. Attaching a document verifies nothing at all — the
only way a claim becomes verified is a person holding the verification grant
saying so, and there is a test for each of those statements.

**Changing evidence invalidates the decision**

Any material change to evidence on a decided claim returns it to review and
records why. Without it the attack needs no special access: get a claim verified
with sound evidence, then swap the evidence, and the badge keeps attesting to a
document no reviewer ever saw.

**A badge that does not overclaim**

"Verified" means the campaign checked the supporting records. The wording never
implies government endorsement or an external audit, because a reviewer here is
campaign staff reading documents the campaign supplied. An unverified claim
carries no badge at all — that is the honest rendering of something nobody has
checked.

**A pre-existing hole, closed**

`GET /media/:id` previously served every stored object to anybody holding its
id. Phase 3 hid unpublished evidence from the public API, but the document
itself stayed downloadable, so its privacy rested on nobody learning a UUID.
Phase 9 restricts assets used only as private evidence to callers holding
`EVIDENCE_READ` in the owning tenant, and returns the same 404 as a missing file
rather than confirming the document exists.

**What this phase refuses to do**

No voter prediction, supporter or opponent classification, political profiling,
scoring or social-media analysis. It also refuses to let AI verify anything: the
Phase 6 assistant is deliberately not wired into this phase at all, because
every available AI feature here sits one step from publishing a provenance claim
the platform invented.

**Exit criteria met:** private evidence cannot be read publicly through the API
or the file route; internal notes and rejection reasons never appear in a public
payload; drafts, rejected and cancelled records are not served publicly;
proposed and ongoing work cannot be presented as completed; transparency figures
are database counts; nothing crosses a tenant boundary.

---

## Unscheduled — React Native Mobile Application

Held the Phase 9 slot until verified work was commissioned in its place. Not
started. The Phase 1 Expo shell (navigation, theming, configuration) and the
Phase 2 device authentication remain in place and unused.

Builds the real application on the Phase 1 shell.

- Staff authentication with secure device token storage
- Field issue capture: camera, GPS, offline queue with sync
- Assigned-issue list and status updates from the field
- Push notifications for assignments and escalations
- Offline-first data layer

---

## Phase 10 — Production Hardening, Security & Launch Readiness ✅

Taking Phases 1-9 from feature-complete to deployable. Almost no new features:
two security fixes for holes that predated the phase, one correctness fix for a
defect that would have looked like flakiness forever, an operations page, and
the documentation somebody needs at three in the morning.

Full detail: [PHASE_10_PRODUCTION_READINESS.md](./PHASE_10_PRODUCTION_READINESS.md).

**Delivered**

- GraphQL depth and cost limits, enforced as validation rules so an abusive
  document is rejected before a resolver runs
- Private evidence documents are no longer servable to anybody holding an id
- `/ready` readiness endpoint, distinct from `/health` liveness
- Operations page at `/admin/system`, reporting measured status only
- API container image; CI gates for dependency audit, migration drift and
  lockfile currency
- 21 hardening tests; [SECURITY.md](./SECURITY.md),
  [DEPLOYMENT.md](./DEPLOYMENT.md), [OPERATIONS.md](./OPERATIONS.md) and
  [PRODUCTION_LAUNCH_CHECKLIST.md](./PRODUCTION_LAUNCH_CHECKLIST.md)

**The pool was smaller than one request**

The finding that had been failing quietly for phases. The analytics services fan
out - one dashboard answer is up to fifteen concurrent aggregates - against a
pool that defaulted to ten. A single request could not fit, so it queued against
itself and, once a second arrived, timed out as an opaque 500. It presented as
dashboards that worked when clicked slowly and broke under load. Default raised
to 25.

**What this phase deliberately did NOT do**

The original sketch bundled scaling and SaaS commercials under this number. Both
were cut, for different reasons. **SaaS commercials** - billing, subscription
plans, usage metering - are a product decision, not a readiness one, and nothing
in Phases 1-9 waits on them. **Scaling infrastructure** - read replicas, Redis,
distributed rate limiting, a CDN - is premature: the platform has never been
measured under load, and building for a scale nobody has observed is how you
acquire infrastructure you cannot debug. What Phase 10 did instead was document
precisely which components are per-instance (rate limits, both queues) so that
the first person to add a second instance knows what to fix.

PostgreSQL row-level security was also not added: tenant isolation is enforced in
the service layer and tested from four directions, and a second enforcement
mechanism with different semantics would be a new way to be wrong rather than a
belt-and-braces.

**Not delivered, and blocking a public launch:** no mail provider, no durable
file storage, no rehearsed backup, no uptime monitoring or alerting, no load
test. These are configuration and infrastructure decisions for the operating
organisation, enumerated with blockers marked in the launch checklist.

---

## Rules that hold across every phase

1. TypeScript everywhere; strict mode; no gratuitous `any`.
2. PostgreSQL via Prisma. No other tier touches the database.
3. GraphQL is the primary API.
4. Resolvers call services; services call repositories.
5. Business logic never lives in UI components.
6. Modular monolith — no microservices.
7. Every business entity is tenant-scoped from the day it is created.
8. No secrets in Git; no environment-specific URLs hard-coded.
9. No political profiling, hidden supporter/opponent scoring, or voter
   identification.
10. No scraping of Instagram, Facebook, ShareChat or any other platform.
11. Citizen analytics stay privacy-conscious and aggregate wherever possible.
