# Production launch checklist

Run through this before a real candidate's name goes on a live site.

Items marked **BLOCKER** are not opinions: the platform either misbehaves or
misleads somebody without them. Items marked *recommended* can follow launch.

Status recorded 2026-09-14 against the committed tree. Anything this repository
cannot verify on its own is marked **must verify** rather than ticked.

---

## Infrastructure

- [ ] Production domain registered and DNS pointed
- [ ] **BLOCKER** HTTPS with a valid certificate, and HTTP redirects to it
      (`Strict-Transport-Security` is only sent in production and only means
      anything over TLS)
- [ ] Neon project created; pooled **and** direct connection strings recorded
- [ ] **BLOCKER** Neon retention window confirmed and written into
      [DEPLOYMENT.md §7](./DEPLOYMENT.md) — currently unverified
- [ ] **BLOCKER** Durable object storage configured for evidence and images (`MEDIA_STORAGE_DRIVER=s3` + Neon Object Storage `MEDIA_S3_*` on the API host).
      The default filesystem store does not survive a redeploy and is not
      backed up
- [ ] Static host or CDN serving `apps/web/dist/`
- [ ] *Recommended* CDN in front of the public site

## Configuration

- [x] Every variable documented in `apps/api/.env.example` (83)
- [ ] **BLOCKER** `JWT_SECRET` generated with `openssl rand -base64 48`, unique
      to production, injected as a platform secret
- [ ] **BLOCKER** `CORS_ORIGINS` set to the exact public origins. Never `*`
- [ ] `NODE_ENV=production`
- [ ] `TRUST_PROXY_HOPS` matches the actual number of proxies in front
- [ ] `DATABASE_POOL_MAX` ≥ 25 (the widest single request fans out to 15)
- [x] Startup validation refuses an unsafe production configuration
- [x] No `.env` is tracked by git — verified; only `.env.example` files are

## Database

- [x] Migrations are forward-only and additive
- [x] CI verifies migrations match the schema (`db:migrate:check`)
- [ ] **BLOCKER** Migrations applied with the **direct** connection string, not
      the pooled one
- [ ] Authorization model seeded (roles and permissions)
- [ ] **BLOCKER** Demo and seed content reviewed — no fictional candidate
      content on a real site
- [x] Indexes reviewed against real query patterns
- [x] `prisma migrate reset` is never run against a real database

## Security

- [x] Argon2id password hashing
- [x] Rotating refresh tokens with replay detection
- [x] Permission checks in the service layer, never the client
- [x] Tenant isolation enforced from the verified session; `NOT_FOUND`, not
      `FORBIDDEN`, on cross-tenant access
- [x] GraphQL introspection off in production (startup fails if on)
- [x] GraphQL depth and cost limits (added Phase 10)
- [x] Security headers via Helmet; CORS an explicit allow-list
- [x] Rate limiting on login, reset, submission, tracking, QR, uploads
- [x] File uploads validated by magic bytes; SVG refused
- [x] Private evidence not servable anonymously (added Phase 10)
- [x] Logs redacted at the transport
- [x] Errors classified before leaving the process — no stack traces, SQL or
      paths reach a client
- [ ] *Recommended* MFA for administrator accounts — **not implemented**
- [ ] *Recommended* External penetration test — **never performed**
- [ ] *Recommended* Secret scanning in CI — not configured

## Privacy

- [x] No IP address, fingerprint or cross-visit identifier stored against a
      submission or scan
- [x] Citizen contact details behind their own permission; revealing them is
      audited
- [x] Notification recipients stored masked
- [x] No political profiling is possible — enforced by the data model, the
      schema, AI output screening and a permanent test
- [ ] **BLOCKER** Privacy notice on the public site reflects what is actually
      collected (see [SECURITY.md §11](./SECURITY.md))
- [ ] Whoever operates this understands what staff can see and has agreed it

## Application

- [ ] Public site: home, candidate, work, achievements, transparency, news,
      events, gallery, contact, search, 404
- [ ] QR: scan a printed code end to end on a real phone, on mobile data
- [ ] Citizen: submit an issue, receive a reference, track it
- [ ] Admin: sign in, triage an issue, publish content, verify a claim, publish
      an achievement
- [ ] Verification: submit → review → verify → publish → visible publicly
- [ ] Evidence: private stays private; published evidence is downloadable
- [ ] Both languages render correctly, including Kannada
- [ ] Error states: 404, failed API call, expired session, slow network
- [ ] Mobile, tablet and desktop widths

## Communication

- [ ] **BLOCKER if citizens are told they will be emailed.** The SMTP provider
      is **not implemented** — only the `log` provider exists, and it delivers
      nothing. Either implement it before launch or make sure no public copy
      promises email
- [x] Notification consent is per submission with a working stop path
- [x] Unsubscribe works without exposing anybody else's data

## Observability

- [x] `/health` (liveness) and `/ready` (readiness) — do not point a liveness
      probe at `/ready`
- [x] `/admin/system` reports measured status
- [x] Structured logging with correlation ids
- [ ] **BLOCKER** External uptime monitor on `/health`, alerting somebody.
      Nothing currently watches this platform — see
      [OPERATIONS.md §8](./OPERATIONS.md)
- [ ] *Recommended* Error aggregation
- [ ] *Recommended* Metrics and a latency baseline

## Quality gates

- [x] TypeScript passes across every workspace
- [x] ESLint passes
- [x] Prettier passes
- [x] Build passes
- [x] Prisma schema valid; no migration drift
- [x] CI runs all of the above plus a dependency audit
- [ ] Full test suite green — see the Phase 10 report for the recorded result
- [ ] *Recommended* Load test against staging — **not performed**

## Operational readiness

- [ ] **BLOCKER** A named person is responsible when it breaks
- [ ] **BLOCKER** A restore has been rehearsed onto a Neon branch
- [ ] Rollback procedure read and understood
      ([DEPLOYMENT.md §6](./DEPLOYMENT.md))
- [ ] Incident procedure read ([OPERATIONS.md §4](./OPERATIONS.md))
- [ ] Somebody other than the developer can sign in and do the daily checks

---

## The short version

If time is short, these are the ones that cause real harm if skipped:

1. HTTPS, and a `JWT_SECRET` that is unique to production.
2. `CORS_ORIGINS` not `*`.
3. Durable, backed-up storage for evidence.
4. A rehearsed restore, and a confirmed retention window.
5. No demo content on a real candidate's site.
6. An uptime monitor that wakes somebody.
7. Do not promise citizens email until SMTP exists.
