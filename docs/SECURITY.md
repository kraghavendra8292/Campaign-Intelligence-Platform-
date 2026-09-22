# Security

What protects this platform, where the boundaries are drawn, and what is
deliberately not protected because it does not need to be. Written for somebody
deciding whether to run this for a real candidate, and for whoever is on call
when something goes wrong.

Companion to [AUTHENTICATION.md](./AUTHENTICATION.md) (the Phase 2 identity
model in full) and [OPERATIONS.md](./OPERATIONS.md).

---

## 1. The threat model

Four kinds of attacker, in the order they are likely to appear:

| Who | Wants | Principal defence |
| --- | --- | --- |
| An opportunist with a URL | Another tenant's data; a private evidence document | Tenant scoping from the verified session; `NOT_FOUND` on cross-tenant access |
| A bored visitor | To take the public site down cheaply | Rate limits; GraphQL depth and cost limits |
| A political opponent | To discredit a verified claim, or to forge one | Separated claim / evidence / verification / publication; immutable verification history |
| A member of staff exceeding their remit | To publish or verify without authority | Permission-per-disclosure, checked server-side in the service layer |

Explicitly **not** in the model: a hostile database administrator, a compromised
Neon control plane, or a nation-state. Those are real risks and this platform
does not claim to mitigate them.

---

## 2. Authentication

Full detail in [AUTHENTICATION.md](./AUTHENTICATION.md). The properties that
matter here:

- **Argon2id** password hashing with a tuned work factor. No plaintext password
  is stored, logged, returned by any GraphQL field, or written to an audit
  record.
- **Rotating refresh tokens** with replay detection: a refresh token used twice
  invalidates the whole session family, because the second use means somebody
  has a copy.
- **Access tokens are short-lived and signed**; the algorithm is pinned, so an
  `alg: none` token is not accepted.
- The refresh token is an **HttpOnly, Secure, SameSite cookie**, so script on a
  compromised page cannot read it.
- **Login and password reset are rate-limited** per identifier and per IP.
- A password reset token is stored as a **SHA-256 digest only** and is
  single-use.

### CSRF

The API is **token-authenticated for every state-changing operation**: the
access token travels in an `Authorization` header, which a cross-site form post
cannot set. The refresh cookie is `SameSite`, so it is not attached to a
cross-site request in the first place, and the refresh mutation is the only
operation that reads it.

That combination is why there is no CSRF token, and it is a deliberate decision
rather than an omission. It stops being true the moment any mutation starts
authorising from a cookie alone — if that is ever proposed, CSRF tokens have to
arrive in the same change.

---

## 3. Authorization

Enforced in the **service layer**, never in a resolver and never in the client.
Every service call begins by asserting a permission and resolving the tenant
from the verified `AuthContext`:

```ts
const { auth: actor, organizationId } = requireWork(auth, 'EVIDENCE_MANAGE');
```

Phase 2 chose an explicit `requirePermission` call over schema directives on
purpose: a directive reads well but hides the check from the call site, and is
silently omitted on a new field. An explicit call is greppable and testable.

**Permissions are per disclosure, not per screen.** Reading a submission,
reading the citizen's phone number, and reading a colleague's candid note are
three different disclosures about three different people, so they are three
grants. The full matrix lives in `packages/types/src/permissions.ts`, which is
the single source of truth; it is seeded into the database and is not editable
at runtime.

### Privilege boundaries that are enforced in code

- No organisation-scoped role holds `USER_DELETE` or `ORGANIZATION_CREATE` —
  those are platform administration, which keeps a tenant admin inside a tenant.
- A role cannot grant a role above its own rank.
- A user cannot act on their own account where that would be an escalation.
- `CONTENT_MANAGER` may prepare anything and publish nothing.
- `ACHIEVEMENT_VERIFY` / `WORK_VERIFY` are held apart from publishing, because
  attesting that something is true and making it public are different acts.

---

## 4. Tenant isolation

The single most important property in the system.

`organizationId` is **always** taken from the verified session and written into
every `where` clause. It is never accepted from a client argument, a header a
client controls, or a path parameter.

Cross-tenant access returns **`NOT_FOUND`, never `FORBIDDEN`**. `FORBIDDEN`
confirms that the id exists somewhere, which is a fact about another tenant's
data and is exactly what an attacker enumerating ids is trying to learn.

Public-site reads are pinned by `publicScope()`, which fixes
`{ organizationId, locale, status: PUBLISHED }`. There is no second code path to
public content, so "could a draft be served?" has one place to look.

**Slugs are unique per tenant, not globally.** Resolving a slug without the
tenant filter would let a visitor to one candidate's site read another
candidate's record by guessing a URL. Every public slug lookup is tenant-scoped
and there is a test for it.

Covered by tests in `issues.test.ts`, `content.test.ts`, `communication.test.ts`,
`verifiedWork.test.ts` and `security.test.ts`.

---

## 5. GraphQL

| Control | State |
| --- | --- |
| Introspection | Off in production; startup **fails** if enabled there |
| GraphQL IDE | Disabled in production |
| Stack traces in responses | Off (`includeStacktraceInErrorResponses: false`) |
| Query depth limit | **12** (`GRAPHQL_MAX_DEPTH`) |
| Query cost limit | **5000** (`GRAPHQL_MAX_COST`) |
| Field authorization | In the service behind every field |
| Pagination | Clamped server-side; no unbounded list |
| Body size | Capped |

### Depth and cost limits (added in Phase 10)

`/graphql` is reachable without authentication — it has to be, because the
public site, the QR landing page and the citizen issue tracker are served
through it.

Every protection before Phase 10 assumed a caller doing something ordinary. Rate
limits cap how **many** requests arrive; pagination caps how many **rows** a
field returns. Neither capped how much work a **single** request could ask for,
and the schema has cycles — a project has evidence, evidence has a document — so
one unauthenticated request could nest those until the server spent minutes on
it. Ten such requests, well inside any rate limit, took the API down.

Both limits run as **validation rules**, so an abusive document is rejected
before a resolver executes and before the database is touched. Implementation
and reasoning: `apps/api/src/graphql/validation/queryLimits.ts`. Tests:
`productionHardening.test.ts`.

The cost estimate is deliberately crude. It charges 1 per field and multiplies a
field's sub-selection by its requested page size, looking for the page argument
both directly (`first: 12`) and one level inside an input object
(`filter: { first: 12 }`) because this schema does both. A variable page size is
charged the assumed default so `first: $n` is not a way around the limit.

### Error disclosure

`formatGraphQLError` classifies every error before it leaves the process. A
client receives a safe message and a stable code. Database errors, SQL, file
paths, provider messages and stack traces go to the server log only.

Provider errors are **classified, never passed through** — a raw mail provider
message routinely echoes the recipient address and occasionally a credential
fragment.

---

## 6. Input handling

- **Validation is server-side and authoritative.** Client validation exists for
  the user's benefit and is never trusted.
- **Rich text is sanitised on write** against an allow-list, not on render — one
  place is responsible, and stored content is already safe by the time any
  surface reads it.
- **Phase 8 public update bodies reject HTML** rather than stripping it. Silent
  stripping invites somebody to find a form the stripper misses.
- **Prisma parameterises everything.** Raw SQL is not used for
  client-influenced queries.
- React escapes by default; `dangerouslySetInnerHTML` is used only for content
  that was sanitised on write.

---

## 7. Files

| Control | How |
| --- | --- |
| Type | **Magic bytes.** The declared MIME type and the filename are both ignored |
| SVG | Not accepted at all — it is a script container |
| Size | Capped per type, tuned for mobile data |
| Storage key | Generated; the user's filename is never a path |
| Traversal | Impossible — the key is generated, not composed |
| Serving | `Content-Type` from the checked type; `nosniff`; documents as attachments |

### Private evidence (Phase 9 / hardened in Phase 10)

Phase 3 hid unpublished evidence from the GraphQL API, but the underlying
document stayed downloadable by anyone holding its id — and staff-visible ids
appear in CMS payloads, screenshots and support threads. Phase 9 made evidence a
first-class concept, which would have turned a latent hole into a routine one.

`GET /media/:id` now resolves whether an asset is **restricted**: an asset used
only as private evidence is not served anonymously. A restricted asset requires
an authenticated caller holding `EVIDENCE_READ` in the owning tenant, is never
cached by a shared cache (`private, no-store`), and returns the **same 404 as a
missing file** — answering 401 would confirm that a document exists at that id.

The rule is narrow so no Phase 1–8 asset changed behaviour: an asset is servable
anonymously if it is published evidence on published content, or if it is used
as ordinary content (a cover image, a gallery item).

---

## 8. Rate limiting and abuse

A global fixed-window limiter covers all HTTP traffic. Public and sensitive
paths carry their own tighter budgets:

| Path | Default |
| --- | --- |
| Login / password reset | Per identifier and per IP |
| Issue submission | Per IP |
| Issue tracking lookup | 20 / 5 min |
| Subscription changes | 20 / hour |
| Follow-up submission | 10 / hour |
| QR redirect | Deliberately generous — a poster in a crowd is legitimate traffic |

Public limits are keyed on **IP alone**. There is no account to key on, and
keying on the reference number would let an attacker rotate references to escape
the limit *while also* letting them lock a citizen out of their own submission.

`TRUST_PROXY_HOPS` is explicit and defaults to 0. Trusting proxies blindly would
let a client spoof `X-Forwarded-For` and evade every limit above.

---

## 9. Transport and headers

Set by Helmet (`middleware/security.ts`):

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'none'` — the API serves JSON only |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Strict-Transport-Security` | 1 year, `includeSubDomains`, **production only** |
| `X-Powered-By` | Removed |

**CORS is an explicit allow-list** from `CORS_ORIGINS`, never a reflection of the
request origin. `Access-Control-Allow-Origin: *` is not used and must not be:
with `credentials: true` it would let any site read authenticated responses.
Requests with no `Origin` (server-to-server, health probes) are permitted.

---

## 10. Secrets

Never committed. `.gitignore` excludes `.env` and `.env.*` while keeping
`.env.example`; `.dockerignore` repeats this so local credentials cannot reach
an image layer. Verified: the only env files tracked by git are the examples.

Secrets are injected by the deployment environment — see
[DEPLOYMENT.md](./DEPLOYMENT.md). The API validates its configuration at
startup and **refuses to boot** on an unsafe production combination: a weak or
missing `JWT_SECRET`, introspection enabled, a `log` mail provider with
notifications on, or incomplete SMTP credentials. Failing to start is the right
behaviour — a server that boots in an unsafe configuration is one nobody
notices.

**Logs are redacted at the transport**, not at each call site, so an incidental
`logger.info({ req })` cannot leak an `Authorization` header, a cookie or a
connection string. Redacted keys include password, token, secret, authorization,
apikey, cookie, session, credential, connectionstring, databaseurl, privatekey,
otp, pin. Tested in `productionHardening.test.ts`.

---

## 11. Privacy

### What is collected

| Data | Why | Who sees it |
| --- | --- | --- |
| Citizen name, phone, email | Only when a citizen opts in so they can be contacted back | Two roles, behind `ISSUE_CONTACT_READ`; revealing it is audited |
| Issue text and photographs | The report itself | Staff with `ISSUE_READ`; attachments need their own grant |
| Notification address | Sending requires it | Nobody — never returned; shown masked (`r***@example.com`) |
| QR scan events | Which outreach channel worked | Aggregate only |

### What is deliberately not collected

No IP address, browser fingerprint or cross-visit identifier is stored against a
submission or a scan. The only per-scan value is a salted hash that rotates
daily and cannot be linked across days, campaigns or to any identity.

**A citizen never has an account.** The whole path from poster to reference
number works for somebody who has never visited before and never will again.

### The political boundary

The platform does not create, store, infer or expose: political preference,
supporter or opponent classification, affiliation, ideology, religion, caste,
ethnicity, persuasion score, voter score, or any individual political profile.

This is enforced in four places rather than by policy alone:

1. **The data model** has no column that could hold one.
2. **The GraphQL schema** cannot express one.
3. **The AI layer** screens model output for banned classifications and rejects
   rather than stores.
4. **A permanent test** asserts that no permission matching
   `SUPPORTER_|OPPONENT_|VOTER_|VOTING_|PROFILING_|AFFILIATION|IDEOLOG|PERSUAS|PREDICT`
   can exist. It runs on every commit.

No social-media scraping or analysis of any platform exists or is permitted.

---

## 12. AI

- **The API key never leaves the server.** It is not in any client bundle, any
  GraphQL response, any log line or any database row.
- **Citizen contact details are never sent to a provider.**
- **Model output is never authoritative.** `Issue.title`, `Issue.description`
  and `Issue.categoryId` are untouched by every code path in Phase 6. Accepting
  a suggestion calls the ordinary update service *as the administrator*, so it
  is audited as a manual edit — the model never becomes the actor.
- **AI cannot verify evidence.** Phase 9's verification is granted by a person
  holding the verification permission and by nothing else.
- **Output is screened** for banned political classifications before storage.
- **A provider outage cannot affect citizens.** Every AI call is
  fire-and-forget, made after the submission has committed.

---

## 13. Audit

Append-only. Written for the questions an investigation actually asks: who saw
what, who said what in the organisation's name, and on what basis a claim
carries a badge.

Metadata is **sanitised** before storage. Reviewer reasoning, rejection reasons,
evidence titles, internal notes, notification recipients and update bodies are
never copied into an audit record — `AUDIT_READ` is a wider grant than
`EVIDENCE_READ` or `ISSUE_NOTE_READ`, so copying content there would route around
the permission that exists to contain it.

Citizen actions are recorded with a **null actor**: the submitter is a member of
the public, not a user, and there is deliberately nothing to attribute it to.

**Known limitation:** audit rows are protected by permission, not by database
grants. A holder of `AUDIT_READ` cannot modify them through any application
path, but anyone with direct database credentials can. Append-only enforcement
at the database level is not configured.

---

## 14. Dependency posture

Assessed 2026-09-14 against the committed lockfile. `npm audit` reports 21
advisories: 0 critical, 4 high, 16 moderate, 1 low.

**None is reachable from the production API request path.**

| Advisory | Severity | Reachable in production? |
| --- | --- | --- |
| `mysql2` — auth downgrade; decompression bomb | High | **No.** Transitive dependency of the `prisma` CLI, which is build- and migration-time only. This platform speaks PostgreSQL and opens no MySQL connection. |
| `deepmerge-ts` — stack exhaustion | High | **No.** Via `@prisma/config`, used when the CLI loads `prisma.config.ts`. |
| `decode-uri-component`, `uuid`, Expo toolchain | Moderate | **No.** Via `@react-navigation` and `@expo/*` — the mobile build toolchain. |
| `esbuild` — dev server file read | Low | **No.** Vite's development server only; not used in a built deployment. |

CI runs two audit steps, because the useful gate and the useful report are not
the same command:

- **Blocking at critical** — zero today, so it is a real gate that passes rather
  than one pinned open.
- **Non-blocking at moderate** — keeps the high and moderate set visible in every
  build log for the monthly review in [OPERATIONS.md](./OPERATIONS.md).

The gate is deliberately not set to `high`. All four high advisories are the
Prisma CLI's own tree, which runs at build and migration time and never in the
request path; gating on high would fail every build until an upstream CLI
release, and a permanently red pipeline is one nobody reads — so the signal would
be lost exactly when a genuine critical arrived.

**The rule for whoever reviews this:** if the report step ever shows a high
advisory on a *runtime* dependency, fix it and tighten the gate. The current
exception is specific to a build-time tree, not a general tolerance for high
advisories.

---

## 15. What is NOT protected

Stated plainly, because a security document that lists only strengths is
misleading.

1. **No multi-factor authentication.** The model supports adding it; it is not
   implemented. A compromised admin password is a compromised admin account.
2. **No account lockout after repeated failures** — only rate limiting. A slow
   distributed guess against a weak password is not stopped by it.
3. **No penetration test** has been performed by anybody outside this codebase.
4. **No automated secret scanning** in CI.
5. **No Content-Security-Policy on the web app** — the API has one, but the
   static site is served by whatever host serves it, and configuring that is a
   deployment step, not a code one.
6. **Audit rows are not append-only at the database level** (see §13).
7. **No Web Application Firewall or DDoS protection** beyond in-process rate
   limits. These are per-instance and in-memory: with several instances the
   effective limit multiplies by the instance count. A shared limiter (Redis) is
   the correct fix and is not implemented.
8. **No intrusion detection or alerting on attack patterns.** Failed logins are
   audited but nothing watches them.

---

## 16. Reporting a vulnerability

Contact the organisation operating this deployment; there is no public security
address for the codebase itself.

For an incident in a running deployment, the containment and rotation steps are
in [OPERATIONS.md §Incident response](./OPERATIONS.md).
