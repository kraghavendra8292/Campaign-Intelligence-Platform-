# Deployment

How to get this platform running for a real organisation, written against what
is actually in the repository rather than against a generic Node deployment.

Companion to [OPERATIONS.md](./OPERATIONS.md) (running it day to day),
[SECURITY.md](./SECURITY.md) and
[PRODUCTION_LAUNCH_CHECKLIST.md](./PRODUCTION_LAUNCH_CHECKLIST.md).

> **Honest status.** No deployment target is configured in this repository. There
> is no Terraform, no Kubernetes manifest, no platform-specific config and no
> deploy pipeline — CI verifies, a human deploys. What follows is the procedure
> and the artefacts the repository does provide. Anything not yet configured is
> marked **NOT CONFIGURED** rather than described as if it existed.

---

## 1. What gets deployed

Three deployable things and one managed service:

| Component | Artefact | Built by |
| --- | --- | --- |
| API | Node server, `apps/api/dist/server.js` | `npm run build -w @rk/api` (tsup) |
| Web | Static files, `apps/web/dist/` | `npm run build -w @rk/web` (Vite) |
| Mobile | Expo application | Expo build — **not part of this procedure** |
| Database | Neon PostgreSQL | Managed |

A `Dockerfile` for the API is at `apps/api/Dockerfile`. The web build is static
and needs no runtime: any static host or CDN serves it.

---

## 2. Environments

| | Development | Staging | Production |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | `production` |
| Database | Neon dev branch, or local Docker | **Its own Neon branch** | Neon primary |
| `GRAPHQL_INTROSPECTION` | `true` | `false` | `false` (enforced) |
| `LOG_LEVEL` | `debug` | `info` | `info` |
| `LOG_PRETTY` | `true` | `false` | `false` |
| AI provider | `mock` | `mock` or a test key | Real key |
| Mail provider | `log` | `log` | SMTP (**not implemented — see §9**) |
| Storage | Local filesystem | Isolated bucket/dir | Production store |

**Staging must never point at the production database.** Neon branching makes
this cheap: branch from production for a realistic dataset, and remember that a
branch contains real citizen data and carries the same obligations.

Run `npm run doctor` to check a configured environment before deploying to it.

---

## 3. Configuration

Every variable is documented in `apps/api/.env.example` (83 of them). Never
commit a real `.env` — `.gitignore` and `.dockerignore` both exclude it.

Inject secrets through the deployment platform's own secret mechanism.

**Required in production**, with no usable default:

```
DATABASE_URL              Neon pooled connection string
DATABASE_URL_UNPOOLED     Neon direct connection string (migrations)
JWT_SECRET                openssl rand -base64 48
CORS_ORIGINS              Exact public origins. Never *
NODE_ENV=production
```

**The API refuses to start** on an unsafe production configuration: a weak or
missing `JWT_SECRET`, `GRAPHQL_INTROSPECTION=true`, notifications enabled with
the `log` provider, or incomplete SMTP credentials. That is deliberate — a
server that boots in an unsafe configuration is one nobody notices.

### Why two database URLs

Neon offers a pooled endpoint and a direct one. The application uses the pooled
endpoint; **migrations must use the direct endpoint**, because a pooler
multiplexes sessions and migrations need advisory locks and a stable session.
Running a migration through the pooler can hang or corrupt migration state.

---

## 4. First deployment

```bash
# 1. Verify locally, exactly as CI does.
npm ci
npm run verify              # tokens, format, lint, typecheck, test

# 2. Build.
npm run build

# 3. Apply migrations, using the DIRECT connection string.
DATABASE_URL="$DATABASE_URL_UNPOOLED" npm run db:migrate:deploy

# 4. Seed the authorization model.
#    Roles and permissions must exist before anybody can sign in.
npm run db:seed
```

> `db:seed` seeds roles, permissions and the demo content used in development.
> **Review `apps/api/prisma/seed.ts` before running it against production** and
> run only the authorization portion. Demo candidate content must not appear on
> a real candidate's site.

Then start the API (`npm start -w @rk/api`, or the container) and publish
`apps/web/dist/` to the static host.

---

## 5. Routine deployment

The order matters, and it is the order that makes a rollback possible.

```
1. Verify        CI is green on the commit being deployed
2. Back up       Confirm a Neon restore point exists (§7)
3. Migrate       Forward-only, additive, using the DIRECT URL
4. Deploy API    New code, which must tolerate the OLD schema too
5. Deploy web    Static files
6. Verify        /health, /ready, a public page, an admin sign-in
```

**Migrate before deploying code, and only with additive migrations.** The
running instance is still on the previous build for the length of the deploy, so
the previous code must keep working against the new schema. That is why every
migration in this repository is additive: new tables, new nullable columns, new
enum members. A dropped or renamed column breaks the running instance the moment
the migration lands.

A change that genuinely needs to remove something is **three deploys**: add the
new shape; move reads and writes to it; remove the old shape once nothing
references it.

### Never

```
prisma migrate reset      Drops every table. Never against a real database.
prisma db push            Bypasses migration history.
```

`db:reset` exists in `package.json` for local development only.

---

## 6. Rollback

| What | How | Notes |
| --- | --- | --- |
| API | Redeploy the previous image or build | Seconds. The usual fix |
| Web | Redeploy the previous static bundle | Seconds |
| Configuration | Restore the previous value, restart | Watch for startup validation failures |
| **Migration** | **Not automatic** | See below |

**There is no down-migration.** Prisma does not generate one and this repository
does not write them. That is a deliberate consequence of the additive rule: an
additive migration almost never needs reverting, because the previous code
ignores what it added.

If a migration must genuinely be undone, the options are a hand-written forward
migration that reverses it, or a Neon point-in-time restore (§7) — which loses
every write since that point and is a last resort.

---

## 7. Backup and recovery

**Neon provides point-in-time restore by branching.** A branch can be created
from any moment inside the project's history-retention window.

> **NOT CONFIGURED / NOT VERIFIED.** The retention window depends on the Neon
> plan for the specific project and has not been confirmed for this deployment.
> No restore has been rehearsed. Before launch, confirm the retention window in
> the Neon console, record it in this file, and rehearse a restore onto a branch.

| | Target | Status |
| --- | --- | --- |
| RPO (data loss tolerated) | Minutes, via PITR | **Unverified** — depends on plan |
| RTO (time to restore) | Under an hour | **Unrehearsed** |

### Restoring

1. In the Neon console, create a branch from the timestamp before the incident.
2. Point a **staging** deployment at it and verify the data.
3. Only then repoint production, or copy the needed rows forward.

Never restore directly over production before verifying on a branch.

### Uploaded files

Evidence documents and images are **not in the database**. They live behind the
storage abstraction (`apps/api/src/modules/content/media/storage.ts`), which
writes to the local filesystem by default.

> **A database restore does not restore files, and a filesystem-backed store on
> a container host does not survive a redeploy.** For any real deployment,
> configure durable object storage with its own versioning and backup before
> accepting evidence uploads. **NOT CONFIGURED.**

---

## 8. Health checks

| Path | Question | Point at it |
| --- | --- | --- |
| `/health` | Is the process alive? | Liveness probe, container `HEALTHCHECK` |
| `/ready` | Are dependencies reachable? | Readiness probe, load-balancer target |
| `/health/db` | Database specifically | Uptime monitor |

**Do not point a liveness probe at `/ready`.** A failing readiness check should
drain traffic from an instance; a failing liveness check restarts it. Pointing
both at the database means a brief blip restarts every healthy instance at once.

None of these returns a connection string, host name or credential.

---

## 9. Known gaps before a real launch

Stated plainly. Each is a decision somebody has to make, not a bug.

1. **No mail provider is implemented.** The SMTP adapter is declared and wired
   but throws `NOT_CONFIGURED`; only the `log` provider "delivers", to the
   server log. **No deployment can currently email a citizen.** Phase 8 §15.
2. **File storage is local-filesystem by default.** Not durable on a container
   host and not backed up. See §7.
3. **Rate limits are in-process and in-memory.** With several instances the
   effective limit multiplies by the instance count. A shared limiter is the
   correct fix and is not implemented.
4. **Queues are in-process and non-durable.** The AI and notification queues
   lose pending work on restart (`requeueStranded()` recovers notification rows
   at boot). Acceptable at one instance; revisit before scaling out.
5. **No error-monitoring provider is wired.** Errors are logged as structured
   JSON; nothing aggregates or alerts on them.
6. **No CDN or WAF** in front of the public site.
7. **No deployment automation.** CI verifies; every deploy is manual.

---

## 10. Scaling notes

The API is stateless apart from the in-process queues and rate limiter in §9, so
it scales horizontally once those move to shared infrastructure. Before adding a
second instance, decide what happens to:

- rate limits (currently per instance),
- both queues (currently per instance),
- any future cache.

Neon handles database scaling, but **use the pooled endpoint** — a serverless or
multi-instance deployment will exhaust direct connections otherwise.
