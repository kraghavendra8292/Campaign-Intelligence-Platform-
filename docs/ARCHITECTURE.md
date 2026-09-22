# Architecture

How the RK Campaign Intelligence Platform is put together, and why.

> Scope note: Phase 1 implements the structure described here. Sections marked
> **Phase 2+** describe the shape later work must fit into — they are design
> commitments, not existing code.

---

## 1. System architecture

Three clients, one API, one database.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Public website  │     │ Campaign console │     │  Mobile (staff)  │
│  React, mobile-  │     │  React, desktop- │     │  React Native    │
│  first, citizens │     │  first, staff    │     │  Expo            │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         └───────────── HTTPS / GraphQL ───────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   apps/api                 │
                    │   Express 5 + Apollo 5     │
                    │   ┌──────────────────────┐ │
                    │   │ transport (GraphQL,  │ │
                    │   │            REST)     │ │
                    │   ├──────────────────────┤ │
                    │   │ services             │ │
                    │   ├──────────────────────┤ │
                    │   │ repositories         │ │
                    │   └──────────────────────┘ │
                    └─────────────┬──────────────┘
                                  │ Prisma 7
                    ┌─────────────▼──────────────┐
                    │   PostgreSQL 17            │
                    └────────────────────────────┘
```

The public website and the campaign console are **two experiences within one
React application** (`apps/web`), separated by route tree and layout, not by
deployment. They share a design system, a build and a GraphQL client. Splitting
them into separate deployables would duplicate all three for no Phase 1 benefit;
the route split means it can still be done later without rewriting components.

### Why a modular monolith

Microservices are explicitly out of scope. At this stage they would add network
partitions, distributed transactions, service discovery and multi-repo release
coordination while the domain model is still unknown. A modular monolith gives
the same internal boundaries — module, service, repository — with none of that
cost, and those boundaries are exactly what a service would later be extracted
along.

## 2. Monorepo architecture

npm workspaces. No Nx/Turborepo: with two buildable apps the orchestration
overhead is not yet earned.

```
apps/       independently runnable applications
packages/   shared code, consumed only by apps and other packages
```

| Package              | Contains                                         | Consumed by         |
| -------------------- | ------------------------------------------------ | ------------------- |
| `@rk/types`          | Shared domain types, tenancy, error codes         | api, web, mobile    |
| `@rk/config`         | Env parsing/validation, cross-app constants       | api, web            |
| `@rk/utils`          | Pure utilities (ids, redaction, timing, strings)  | api                 |
| `@rk/design-tokens`  | **The** visual source of truth + CSS generation   | web, mobile, ui     |
| `@rk/graphql`        | GraphQL SDL + client operation documents          | api, web            |
| `@rk/ui`             | React (web) design-system primitives              | web                 |

### Packages ship TypeScript source, not build output

Each package's `exports` points at `src/index.ts`. Every consumer (Vite, tsup,
Metro, tsx, Vitest) compiles TypeScript already, so shipping source removes an
entire class of problem: no build ordering, no stale `dist`, no watch-mode
rebuild step, and go-to-definition lands on real code.

Two consequences follow, and both are deliberate:

1. **Relative imports inside packages are extensionless** (`'./tokens'`, not
   `'./tokens.js'`). Metro — unlike Vite and `tsc` — will not resolve a `.js`
   specifier to a `.ts` file. Extensionless is the one form every resolver in
   this repo agrees on. Applied uniformly across apps and packages so there is a
   single rule to remember.
2. Packages are not independently publishable as-is. They are internal to this
   repository; if one ever needs publishing, it gains its own build step then.

### Dependency direction

```
apps  ──▶  packages  ──▶  packages
```

Packages never import from `apps`. `@rk/ui` depends on `@rk/design-tokens`;
nothing depends on `@rk/ui` except the web app.

## 3. Web / API / mobile relationship

The API is the only tier that talks to PostgreSQL. Clients hold no database
credentials and no direct database access, in any phase.

Contracts shared across the boundary live in packages, so a change is a
compile error rather than a runtime surprise:

- **Schema**: `@rk/graphql` holds the SDL. The API builds its executable schema
  from it; clients send operations defined next to it.
- **Types**: `@rk/types` holds the health, error and tenancy shapes both sides use.
- **Constants**: `@rk/config` holds the GraphQL path, health paths, the
  correlation-id and tenant header names, and the body size limit — so the
  client and server can never disagree about a wire-level name.

The web client is a ~90-line `fetch` wrapper (`apps/web/src/lib/graphqlClient.ts`),
not Apollo Client or urql. There is no business data to cache yet; that choice
should be made in Phase 3 against real query patterns, and the wrapper already
establishes the error and correlation-id contract the app codes against.

Web and mobile share **tokens, types and contracts — not components**. A web
`<button>` and a native `Pressable` cannot be one implementation without a
cross-platform abstraction layer that would cost more than it saves. The two
`Button`s therefore look identical because they read the same tokens, not
because they share code.

## 4. GraphQL architecture

```
packages/graphql/src/typeDefs/     SDL, one file per module   ← source of truth
apps/api/src/graphql/
  ├── schema/       makeExecutableSchema(typeDefs, resolvers)
  ├── resolvers/    merges each module's resolvers; custom scalars
  ├── context/      per-request context (prisma, log, correlationId, tenant)
  ├── plugins/      operation logging
  └── directives/   (empty in Phase 1; @auth/@hasRole land in Phase 2)
apps/api/src/modules/<name>/<name>.resolvers.ts   the implementations
```

Rules:

- `baseTypeDefs` declares `Query` and `Mutation`; every module **extends** them.
  Adding a module never edits another module's SDL.
- **Resolvers contain no business logic.** They read arguments, call a service,
  return. This is enforced by convention and reviewed; `health.resolvers.ts` is
  the reference.
- Every error leaving GraphQL passes through `formatGraphQLError`, which
  rebuilds the payload from an **allow-list** of fields. Any extension Apollo or
  a future plugin adds — `stacktrace` included — is excluded by default rather
  than deleted after the fact.
- Introspection and the GraphQL IDE are enabled outside production and off in
  production, so the schema is not enumerable by an anonymous caller.

### Adding a module (Phase 2+)

1. Add SDL to `packages/graphql/src/typeDefs/<name>.ts`, register it in that
   package's `typeDefs` array.
2. Create `apps/api/src/modules/<name>/` following the anatomy in
   [`apps/api/src/modules/README.md`](../apps/api/src/modules/README.md).
3. Spread the module's resolvers into `graphql/resolvers/index.ts`.
4. Mount its router in `app.ts` if it needs REST.

## 5. PostgreSQL / Prisma architecture

```
apps/api/prisma/schema.prisma     models (backend-owned)
apps/api/prisma/migrations/       versioned, committed SQL
apps/api/prisma/seed.ts           idempotent development data
apps/api/prisma.config.ts         CLI configuration (Prisma 7)
apps/api/src/database/prisma.ts   the single client instance
```

- The schema lives **inside the API**, not at the repository root, because the
  backend owns the database. No other tier may read or write it.
- **One `PrismaClient` per process.** Each client owns a connection pool;
  per-request construction would exhaust the connection budget. The instance is
  cached on `globalThis` outside production so a dev hot-restart reuses the pool.
- Prisma 7 changed two things this codebase accommodates explicitly: the
  connection URL is no longer in `schema.prisma` (the CLI reads
  `prisma.config.ts`; the runtime uses the `PrismaPg` driver adapter), and `.env`
  is no longer loaded implicitly.

### Hosting: Neon

PostgreSQL is hosted on **Neon**, which separates storage from compute and gives
branching, autoscaling and scale-to-zero. Three consequences are designed for
rather than discovered:

**1. Two endpoints, routed by workload.** Neon exposes a pooled endpoint
(`-pooler`, fronted by PgBouncer in transaction mode) and a direct one. Pooled is
correct for application traffic; it is wrong for migrations, because Prisma
Migrate relies on session state and prepared statements that a transaction-mode
pooler does not preserve — and the resulting errors
(`prepared statement "s0" already exists`, a `SET` that silently does not
persist) never mention pooling. `src/config/databaseUrl.ts` is the single place
that encodes the rule, so `prisma.config.ts` and `seed.ts` cannot drift:

| Workload                    | Variable                | Endpoint |
| --------------------------- | ----------------------- | -------- |
| Runtime queries             | `DATABASE_URL`          | Pooled   |
| Migrations, seeding, dumps  | `DATABASE_URL_UNPOOLED` | Direct   |

`DATABASE_URL_UNPOOLED` falls back to `DATABASE_URL`, so a plain local
PostgreSQL — which has no such split — still needs only one variable.

**2. TLS is mandatory for remote hosts.** The connection now crosses the public
internet, so `postgresUrlSchema` *rejects* a non-local URL without an `sslmode`
at startup rather than letting credentials travel in the clear. Localhost and
the Docker service name are exempt so CI and offline work need no certificates.
The documented mode is `sslmode=verify-full`: the `pg` driver currently treats
`require` as full verification, but that changes to weaker libpq semantics in
pg v9, so stating it explicitly keeps the strong behaviour across that upgrade.

**3. Scale-to-zero means cold starts.** Idle computes suspend, so the first query
after a quiet period is slow. The health probe's timeout is therefore
configurable and defaults to 10s (`DATABASE_PROBE_TIMEOUT_MS`) — a tight timeout
would report an idle-but-healthy database as an outage and could cause an
orchestrator to drain traffic from a working service.

**Driver choice.** `@prisma/adapter-pg` (node-postgres) over TCP, not the Neon
serverless driver. The serverless driver's HTTP/WebSocket transport exists for
edge and per-request runtimes; this API is a long-running process that reuses one
pool across requests, where a plain TCP pool is simpler and faster. That choice
would be revisited only if the API moved to a per-request runtime.

**CI does not use Neon.** It runs a disposable `postgres:17-alpine` service
container instead, which keeps database credentials out of CI entirely (fork pull
requests work; no secret can leak through a log), gives each run a pristine
schema, and still exercises the real migration and connectivity paths.

**Docker is now optional.** `docker-compose.yml` remains as an offline fallback
only; it is no longer the default development database.
- **Repositories are the only layer that touches Prisma.** Services call
  repositories; transports call services.
- Raw SQL is used exactly once — `SELECT 1` in the health probe — because the
  probe must deliberately touch no table so it stays valid as the schema evolves.
- Timestamps are `timestamptz`, ids are UUID, and `@@map` keeps table names
  snake_case.

### Phase 1 model

```
Organization (tenant root)
     │
     ├──< Membership >── User
                │
                └── Role
```

Four models, no business entities. `Membership` is the seam that makes the
platform multi-tenant: a user may belong to several organisations with a
different role in each. No authentication material is stored — passwords,
sessions and MFA belong to Phase 2.

## 6. Module structure

The API grows by adding modules, never by growing `app.ts`:

| Module                                 | Phase | Status      |
| -------------------------------------- | ----- | ----------- |
| `auth`, `users`, `organizations`       | 2     | Implemented |
| `content` (public, cms, media, shared) | 3     | Implemented |
| `qr` (public, cms, shared)             | 4     | Implemented |
| `issues` (public, cms, shared)         | 5     | Implemented |
| `analytics`                            | 6–7   | Planned     |
| `ai`                                   | 8     | Planned     |

Phase 3's `content` module is subdivided by *audience* rather than by entity:
`public/` serves anonymous readers, `cms/` serves authenticated staff, `media/`
handles uploads and `shared/` holds sanitisation and slug rules. Splitting it by
entity instead would have put the publishing boundary in seven places. See
[CONTENT.md](./CONTENT.md).

Phase 4's `qr` module follows the same split for the same reason. `public/`
holds the anonymous scan path — resolution, the redirect route and scan
recording — and `cms/` holds the authenticated console and analytics. The two
share only `shared/`, which owns destination validation and the scan
classifier. Keeping the anonymous path in its own folder makes it obvious which
code runs without a session, which is exactly the code that must not assume
one. See [QR_CAMPAIGNS.md](./QR_CAMPAIGNS.md).

Phase 5's `issues` module uses the same three folders, and here the split earns
its keep most: `public/` contains the only WRITE path on the platform open to
somebody with no account, plus the attachment upload and the reference lookup.
Everything in it must assume a hostile, unauthenticated caller; everything in
`cms/` may assume a session and a tenant. Having to move a file between folders
to change that assumption is the point. See
[ISSUES_AND_FEEDBACK.md](./ISSUES_AND_FEEDBACK.md).

Each is a folder with the same five-file anatomy. When a module eventually
justifies its own deployable, its repository layer is the extraction seam.

## 7. Future multi-tenancy approach

Tenancy is designed in from Phase 1 even though nothing enforces it yet.

**Model.** `Organization` is the tenant root. Every business entity added from
Phase 2 onwards carries `organizationId`, indexes it, and is queried through it.
`TenantScoped` in `@rk/types` marks the shape.

**Isolation strategy.** Shared database, shared schema, row-level tenant
discriminator. Chosen over schema-per-tenant or database-per-tenant because a
campaign platform expects many small tenants, where per-tenant schemas make
migrations O(tenants) and connection pooling far harder. The trade-off is that
isolation becomes a *code* guarantee, which is why it is structural here:

1. `GraphQLContext.tenant` is the only sanctioned source of the active tenant.
   It is typed `TenantContext | null` and is **always `null` in Phase 1** — there
   is no authentication, so no tenant can be trusted.
2. Phase 2 resolves it from the authenticated session — never from a
   client-supplied header or query argument.
3. Repository methods for business entities take `organizationId` explicitly, so
   an unscoped query is visible in review rather than implicit.
4. Phase 10 adds PostgreSQL row-level security as defence in depth, so a missed
   filter fails closed at the database rather than leaking across tenants.

The `x-organization-id` header name is already reserved in `@rk/config` and
allow-listed in CORS so clients and server agree on it from day one.

## 8. Cross-cutting foundations

**Logging.** One Pino logger (`logging/logger.ts`); `console` is an ESLint error
in the API. Redaction is configured at the transport, so an incidental
`logger.info({ req })` cannot leak an `Authorization` header, cookie or
connection string. Pretty in development, JSON in production.

**Correlation ids.** `requestContext` runs first, accepts a client-supplied id
only if it matches `^[A-Za-z0-9_-]{1,128}$` (otherwise a hostile client could
inject newlines into logs), echoes it in `x-correlation-id`, and binds it to a
child logger. It appears in every log line and every error payload, so a user
report maps to exact server-side logs.

**Errors.** `AppError` carries `code`, `status`, client-safe `message` and
optional `details`. 4xx messages are exposed; 5xx are replaced with a generic
message and the real error is logged server-side with its `cause`. Both
transports render the same envelope.

**Security.** Helmet with a JSON-API CSP (`default-src 'none'`); a CORS
**allow-list** rather than origin reflection; a 256 KB body cap; fixed-window
rate limiting that skips health endpoints; `trust proxy` set from configuration
so `X-Forwarded-For` cannot be spoofed. Environment validation at startup means
a misconfigured deployment fails immediately instead of at first use. No fake
authentication was added to satisfy a checklist.

**Design tokens.** `packages/design-tokens/src/tokens.ts` is the only place a
colour is defined. A generator emits `tokens.generated.css` (committed, with a
CI freshness check) for the web; React Native imports the same objects and
converts rem to density-independent pixels. The raw palette is intentionally
**not** exported as CSS variables, so components must consume semantic roles
(`--color-primary`) and the brand stays re-themeable from one file.

## 9. Known Phase 1 limitations

Recorded so they are chosen, not discovered:

- **Rate limiting is in-memory.** Correct for one process; it does not coordinate
  across instances. Swapping in a Redis store (the placeholder service already
  exists in `docker-compose.yml`) is the only change needed.
- **`/admin` is unguarded.** There is no authentication to guard it with. It
  renders no sensitive data, and Phase 2 wraps the layout in a route guard.
- **The web GraphQL client has no cache or request dedupe.** Intentional — see §3.
- **No observability beyond logs.** Metrics and tracing are Phase 10.
- **TypeScript is pinned to 5.9 monorepo-wide**, though Expo SDK 57 suggests
  TypeScript 6. One toolchain version keeps ESLint, Prisma, Vite and tsup on a
  combination that is actually verified together; Expo builds and type-checks
  correctly on 5.9.
