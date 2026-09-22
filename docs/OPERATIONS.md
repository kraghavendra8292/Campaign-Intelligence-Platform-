# Operations

Running this platform once it is live: what to check, how often, and what to do
when something breaks.

Companion to [DEPLOYMENT.md](./DEPLOYMENT.md) and [SECURITY.md](./SECURITY.md).

---

## 1. Where to look first

| Question | Where |
| --- | --- |
| Is anything broken? | `/admin/system` — the operations page |
| Is the process alive? | `GET /health` |
| Are dependencies reachable? | `GET /ready` |
| What happened, and who did it? | Audit log in the admin console |
| Why did a request fail? | Server logs, by correlation id |

The operations page reports **measured** status. Every value comes from the same
code path the feature itself uses — the database is probed, the AI and mail
providers are asked whether they are configured, the queues report their real
counters. Nothing on it is hard-coded, and where the platform genuinely cannot
tell, it says `UNKNOWN` rather than guessing.

`UNKNOWN` is an honest answer. `HEALTHY` when nobody checked would be worse than
having no page at all.

---

## 2. Routine checks

### Daily (two minutes)

- [ ] `/admin/system` — overall status is `HEALTHY`
- [ ] Communication centre — failed messages are not accumulating
- [ ] Verification queue — nothing has been waiting unreasonably long
- [ ] Skim the error log for anything repeating

### Weekly

- [ ] Audit log — any unexpected privileged action (verification, publication,
      role change, contact-detail reveal)
- [ ] Failed login pattern against one account
- [ ] AI queue depth and failure count, if AI is enabled
- [ ] Confirm a Neon restore point exists inside the retention window
- [ ] Storage growth — evidence and attachments are the fastest-growing data

### Monthly

- [ ] `npm audit` — review the **non-blocking** report from CI (see §7)
- [ ] Dependency updates: patch and minor, with the full suite run afterwards
- [ ] **Rehearse a restore** onto a Neon branch (§5)
- [ ] Review who holds `ACHIEVEMENT_VERIFY`, `WORK_VERIFY`,
      `COMMUNICATION_PUBLISH`, `ISSUE_CONTACT_READ` and `ANALYTICS_EXPORT` —
      these are the five grants that matter most and the ones that accumulate
- [ ] Confirm no demo or test content is live on the public site

---

## 3. Reading the logs

Logs are structured JSON, one object per line, redacted at the transport.

```
level      fatal | error | warn | info | debug | trace
service    rk-api
env        production
reqId      correlation id — follow one request end to end
msg        what happened
```

**Every request carries a correlation id**, returned in the
`x-correlation-id` response header. When somebody reports a failure, ask for it:
it turns "the site broke this morning" into one grep.

```bash
grep '"reqId":"<id>"' app.log
```

Credentials never appear. Authorization headers, cookies, tokens, API keys,
passwords and connection strings are redacted before anything reaches a sink —
enforced centrally, not at each call site, so an incidental `logger.info({ req })`
cannot leak one.

`LOG_LEVEL=info` in production. `debug` is verbose enough to hurt, and at trace
level Prisma logs query shapes.

---

## 4. Common incidents

### The site is down

1. `GET /health` — no response means the process is gone; check the host.
2. `GET /ready` — 503 means the process is fine but a dependency is not.
3. `/admin/system` names which component.

### The database is unreachable

Check the Neon console first: a suspended compute, an exhausted plan limit and a
genuine outage look identical from the application.

Neon scale-to-zero means **the first request after idle can be slow** while the
compute resumes. That is expected, not a fault.

### Dashboards fail intermittently under load

The analytics services fan out — one dashboard answer is up to **15 concurrent
aggregates**. If `DATABASE_POOL_MAX` is smaller than the widest single request,
that request queues against itself and times out as an opaque 500 once a second
request arrives. It looks like flakiness: fine when clicked slowly, broken under
load.

This was a real defect, found and fixed in Phase 10 (the default was 10 against
a fan-out of 15). If it recurs after adding a wider query, raise
`DATABASE_POOL_MAX` or bound the fan-out. **Do not treat intermittent dashboard
500s as flaky tests.**

### Sporadic 500s with no pattern

Check for `Connection terminated unexpectedly` in the logs. A pooled connection
crossing a NAT or stateful firewall gets dropped silently when idle; the socket
looks open here and is gone at the far end. TCP keepalive is enabled on the pool
to prevent it, but the application does **not** retry a failed connection, so one
that slips through reaches a user as a 500.

More likely the further the deployment sits from the database region. If it
becomes frequent, move the API closer to the Neon region before adding retries.

### No citizen is receiving email

Almost certainly expected: **the SMTP provider is not implemented**. Only the
`log` provider "delivers", to the server log. `/admin/system` reports
notifications as `DEGRADED` and says so explicitly. See
[DEPLOYMENT.md §9](./DEPLOYMENT.md).

### AI summaries stopped

`DEGRADED`, never `DOWN`: every AI call is fire-and-forget, made after the
submission commits. Citizens are unaffected and staff lose summaries only. Check
the provider key and quota.

### Suspected compromise

1. **Contain** — suspend the affected account; revoke its sessions.
2. **Rotate** — `JWT_SECRET` (invalidates every session), database credentials,
   AI and mail keys, storage credentials.
3. **Assess** — audit log for what the account did; `ISSUE_CONTACT_VIEWED` and
   the Phase 9 verification actions are the records that matter most.
4. **Recover** — see §5 if data was altered.
5. **Write it down** — what happened, what was accessed, what changed.

Rotating `JWT_SECRET` signs everybody out. That is the correct trade when a
token may be compromised.

---

## 5. Backup and restore

**Neon point-in-time restore by branching.** See
[DEPLOYMENT.md §7](./DEPLOYMENT.md) for the procedure.

> **Unverified.** The retention window depends on the Neon plan for this project
> and has not been confirmed. No restore has been rehearsed. Do both before
> launch, and record the window here.

Restore onto a **branch** and verify there before repointing production. Never
restore over production first.

**Uploaded files are not in the database.** A database restore does not bring
back evidence documents or images, and a filesystem-backed store on a container
host does not survive a redeploy. Durable object storage is **not configured**.

---

## 6. Data retention

Nothing is deleted automatically. No retention job exists in the codebase, and
none should be added without an explicit written policy — deleting a citizen's
report or an audit record is not a decision to make in code.

What accumulates, fastest first: QR scan events, audit logs, issue attachments
and evidence documents, AI usage logs, notification records.

Audit records are **append-only through the application** but not enforced as
such at the database level: anyone with direct database credentials can alter
them. See [SECURITY.md §13](./SECURITY.md).

---

## 7. Dependencies

CI runs two audit steps: **blocking at critical** (zero today) and
**non-blocking at moderate**, so the fuller picture stays visible in every build
log without a permanently red pipeline.

Reviewing the monthly report, the question is **reachability, not severity**. All
four current high advisories sit in the Prisma CLI's own tree, which runs at
build and migration time and never in the request path.

**If a high advisory ever appears on a runtime dependency, fix it and tighten the
CI gate.** The current exception is specific to a build-time tree, not a general
tolerance.

---

## 8. What is not monitored

Stated plainly, because knowing the gaps is the point of this section.

1. **No alerting.** Nothing pages anybody. Failures are visible on
   `/admin/system` and in the logs, and only if somebody looks.
2. **No error aggregation.** Errors are structured JSON; nothing groups them,
   counts them or spots a spike.
3. **No uptime monitoring.** `/health` and `/ready` exist and nothing calls them
   on a schedule. Pointing an external monitor at `/health` is the single
   highest-value thing to add.
4. **No metrics.** Request rate, latency and error rate are not collected, so
   there is no p95 and no baseline to compare against.
5. **No log aggregation.** Logs go to stdout; searching means having access to
   the host.
6. **No SLO.** Targets could be set once metrics exist, but claiming one today
   would be inventing a number.

Before a real launch the minimum is (3) — an external monitor on `/health` with
an email or SMS alert. Everything else can follow.
