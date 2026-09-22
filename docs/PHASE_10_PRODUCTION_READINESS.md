# Phase 10 — Production readiness

What changed in Phase 10, what the audit found, and what is still missing. This
is the reference; the operational procedures live in
[DEPLOYMENT.md](./DEPLOYMENT.md), [OPERATIONS.md](./OPERATIONS.md),
[SECURITY.md](./SECURITY.md) and
[PRODUCTION_LAUNCH_CHECKLIST.md](./PRODUCTION_LAUNCH_CHECKLIST.md).

---

## 1. What this phase was

Phases 1–9 built the product. Phase 10 asked one question of all of it: *what
breaks when real people use this?* — and then fixed what the answer turned up.

It added almost no features. Two of the four code changes are security fixes for
holes that existed since earlier phases, one is a correctness fix for a defect
that would have looked like flakiness forever, and one is an operations page.

The rule throughout was **harden, do not replace**. The foundation was already
strong: Helmet headers, an explicit CORS allow-list, transport-level log
redaction, rate limiting, magic-byte file validation, startup configuration
validation, structured logging with correlation ids, and health checks all
existed before this phase and were left alone.

---

## 2. What the audit found

Four material gaps. Each was verified before being fixed and after.

### 2.1 Unbounded GraphQL queries — **security, fixed**

`/graphql` is reachable without authentication; it has to be, because the public
site, the QR landing page and the citizen issue tracker are served through it.

Every protection before this phase assumed a caller doing something ordinary.
Rate limits cap how **many** requests arrive. Pagination caps how many **rows** a
field returns. Neither capped how much work a **single** request could ask for —
and the schema has cycles, so one unauthenticated request could nest a project
into its evidence into its document until the server spent minutes on it. Ten
such requests, well inside any rate limit, took the API down.

Fixed with depth and cost limits enforced as **validation rules**, so an abusive
document is rejected before a resolver executes and before the database is
touched. `apps/api/src/graphql/validation/queryLimits.ts`.

The first implementation was wrong in a way the tests caught immediately: it
multiplied cost through every field with a sub-selection, including plain object
fields, so the ordinary public listing compounded to a cost of eighteen thousand
and was rejected. The fix charges only fields that actually carry a pagination
argument, looking both at direct arguments (`first: 12`) and one level inside an
input object (`filter: { first: 12 }`) because this schema does both.

### 2.2 Private evidence was downloadable — **security, fixed**

Phase 3 hid unpublished evidence from the GraphQL API, but the underlying
document stayed servable to anyone holding its id — and staff-visible ids appear
in CMS payloads, screenshots and support threads. Phase 9 made evidence a
first-class concept, which would have turned a latent hole into a routine one.

`GET /media/:id` now resolves whether an asset is **restricted**: one used only
as private evidence requires an authenticated caller with `EVIDENCE_READ` in the
owning tenant, is never stored by a shared cache, and returns the **same 404 as a
missing file** — answering 401 would confirm a document exists at that id.

The rule is deliberately narrow so no Phase 1–8 asset changed behaviour.

### 2.3 The connection pool was smaller than one request — **correctness, fixed**

The most interesting finding, because it had been failing quietly for phases.

The analytics services deliberately fan out — one dashboard answer is a dozen
independent aggregates issued together. Measured across the codebase:

| Service | Concurrent queries in one request |
| --- | --- |
| `issueAnalytics.byCategory` | **15** |
| `qrAnalytics.summary` | **12** |
| `analytics.overview` | **11** |
| `publicTransparency.summary` | 7 |

`DATABASE_POOL_MAX` defaulted to **10**. Three separate dashboards could not fit
one request into the pool.

It did not fail outright, which is why it survived. The request queued against
itself, and once a second request arrived it waited past the 15-second
connection timeout and surfaced as an opaque `INTERNAL_SERVER_ERROR`. In
practice: dashboards that worked when clicked slowly and failed intermittently
under load — the hardest kind of fault to diagnose from a bug report, and the
kind that gets dismissed as a flaky test.

It presented here exactly that way. The full suite showed 8 failures across
`qr.test.ts` and `issues.test.ts`; the same tests passed individually. The
diagnosis was confirmed by bisecting (disabling the new validation rules changed
nothing), by probing the service directly (it worked in isolation with data and
with an empty tenant), and by counting the fan-out against the pool size.

Default raised to **25**, which fits the widest single request with room for
concurrent traffic. Afterwards `qr.test.ts` went from 41/44 to **44/44**.

### 2.4 Idle pooled connections were being reaped — **resilience, fixed**

Found while chasing the tail of 2.3. Even with a correctly sized pool, long runs
produced sporadic `Connection terminated unexpectedly` and opaque Prisma request
errors that never reproduced in isolation.

A pooled connection to a hosted database crosses at least one NAT or stateful
firewall, and those drop idle flows silently: the socket still looks open from
the application's side and is gone at the other end, so the next query fails with
nothing diagnostic attached. It presents as unexplained intermittent 500s that
vanish when somebody goes looking, and it is worse the further the client sits
from the database region.

Fixed by enabling TCP keepalive on the pool (`keepAlive`, with a 10-second
initial delay, well under the ~350 seconds common NAT tables use). Afterwards the
Phase 9 suite went from 53/59 to **59/59** on the same machine and network.

**Still not implemented:** the application does not retry a transient connection
failure. When one happens, a user sees a 500. A naive retry is worse than the
problem — replaying a mutation can double-write — so the correct fix is a
read-only retry on connection-establishment errors specifically, and it is listed
as outstanding in §5.

### 2.5 Readiness existed but was not routed — **operations, fixed**

`healthService.getReadiness()` had been implemented since Phase 1 and was
reachable over HTTP only as `/health/db` — named for the database rather than for
the question an orchestrator asks. Exposed at `/ready`, with `/health/db` kept
so any existing monitor keeps working.

`/health` and `/ready` are deliberately different: a failing readiness check
should drain traffic from an instance, a failing liveness check should restart
it. Pointing both at the database means one blip restarts every healthy instance.

---

## 3. What was added

| | |
| --- | --- |
| GraphQL depth and cost limits | `graphql/validation/queryLimits.ts` |
| Restricted media resolution | `content/media/media.service.ts`, `media.routes.ts` |
| `/ready` endpoint | `modules/health/health.routes.ts` |
| Operations status service | `modules/ops/systemStatus.service.ts` |
| Operations page | `/admin/system` |
| API container image | `apps/api/Dockerfile`, `.dockerignore` |
| CI: audit, migration drift, lockfile gates | `.github/workflows/ci.yml` |
| 21 hardening tests | `__tests__/productionHardening.test.ts` |
| Four operational documents | This file and its three companions |

### The operations page

`/admin/system`, behind `AUDIT_READ` — reused rather than inventing a permission,
because that grant already means "may see how this installation is behaving
rather than what it contains", and it is held by the role that would be asked to
investigate an outage.

**Every value on it is observed.** The database is probed, providers are asked
whether they are configured, queues report real counters. Where the platform
cannot tell, it reports `UNKNOWN`. A status page that says `HEALTHY` because
nobody checked is worse than none: it turns an unknown into a false reassurance
at the moment somebody needs the truth.

Two judgements encoded in it:

- A component **switched off on purpose is `HEALTHY`**, not degraded. Reporting
  disabled-AI as degraded trains operators to ignore the colour.
- The mail provider on `log` is **`DEGRADED`**, because an operator reading that
  row wants to know whether citizens actually receive mail. They do not.

It carries no connection string, host name, provider endpoint or path.

---

## 4. Verification

Everything below was executed. Nothing is asserted from inspection alone.

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | PASS, all workspaces |
| ESLint | `npx eslint .` | PASS |
| Prettier | `npx prettier --check .` | PASS |
| Build | `npm run build` | PASS |
| Prisma schema | `npx prisma validate` | PASS |
| Migration drift | `db:migrate:check` | PASS — no difference |
| Audit (blocking gate) | `npm audit --audit-level=critical` | PASS — 0 critical |
| Phase 10 tests | `productionHardening.test.ts` | 21/21 |

The full-suite result is recorded in the Phase 10 completion report rather than
here, because it is a point-in-time measurement rather than a property of the
design.

### Dependency posture

21 advisories: 0 critical, 4 high, 16 moderate, 1 low. **None is reachable from
the production API request path** — the high ones are the Prisma CLI's own tree
(build and migration time), the moderate ones are the Expo and React Navigation
toolchains. Full assessment in [SECURITY.md §14](./SECURITY.md).

CI gates blocking at **critical** and reports non-blocking at **moderate**, so
the fuller picture stays visible without a permanently red pipeline — a pipeline
nobody reads is one that hides the next genuine critical.

---

## 5. What Phase 10 did NOT do

Listed because a readiness document that records only what was done is
misleading.

1. **No mail provider implemented.** The SMTP adapter throws `NOT_CONFIGURED`.
   No deployment can email a citizen. This is a Phase 8 gap that Phase 10 did
   not close.
2. **No durable file storage configured.** Evidence and images default to the
   local filesystem, which does not survive a container redeploy and is not
   backed up.
3. **No backup rehearsed, no retention window confirmed.** Neon provides
   point-in-time restore; nobody has tested it here.
4. **No alerting, metrics, error aggregation or uptime monitoring.** `/health`
   exists and nothing calls it on a schedule.
5. **No load testing.** No measured latency, no p95, no baseline — which is why
   no SLO is stated. Claiming one would be inventing a number.
6. **No deployment automation.** CI verifies; every deploy is manual.
7. **Rate limits and queues remain in-process.** Per instance and in memory, so
   both need shared infrastructure before scaling out.
8. **No retry on transient database connection failures.** Keepalive (§2.4)
   makes them rarer; it does not make them impossible, and when one occurs the
   user sees a 500. A read-only retry on connection-establishment errors is the
   right fix and is not implemented.
9. **No MFA, no account lockout, no penetration test, no secret scanning.**
10. **Audit rows are not append-only at the database level.**
11. **No CSP on the web app.** The API has one; the static site's headers belong
    to whatever host serves it.

---

## 6. The honest summary

The platform is **secure and correct enough to deploy for a pilot**, and is
**not yet operationally complete**.

What that means concretely: an attacker cannot cross a tenant boundary, read
private evidence, exhaust the server with one query, enumerate the schema, or
find a citizen's political profile — because there is none to find. Those
properties are enforced in code and covered by tests.

But nobody will be told when it breaks, evidence files are not backed up, and no
citizen can be emailed. Those are not code problems; they are configuration and
infrastructure decisions the operating organisation has to make, and they are
enumerated in the launch checklist with the blockers marked.

A pilot with a handful of administrators and a known user base is reasonable
today. A public launch is not, until at minimum the checklist's seven short-list
items are done.
