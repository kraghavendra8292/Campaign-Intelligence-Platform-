# RK Campaign Intelligence Platform

Multi-tenant campaign and public-engagement SaaS platform.

> **Status: Phase 5 — Citizen Feedback + Issue Reporting.**
> The technical foundation (Phase 1), the security foundation (Phase 2), the
> public site with its CMS (Phase 3), the QR campaign platform (Phase 4) and
> citizen feedback and issue reporting (Phase 5) are in place.
> See [implemented scope](#18-implemented-scope) and
> [what is NOT implemented](#19-not-implemented-yet),
> [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) for the security model,
> [docs/CONTENT.md](docs/CONTENT.md) for content and localisation,
> [docs/QR_CAMPAIGNS.md](docs/QR_CAMPAIGNS.md) for QR campaigns, and
> [docs/ISSUES_AND_FEEDBACK.md](docs/ISSUES_AND_FEEDBACK.md) for citizen
> submissions and how their data is protected.

---

## 1. Project overview

The platform will eventually let candidates and campaign teams run a public
website, publish verified work and development projects, run QR campaigns,
collect voluntary citizen feedback, take in and resolve constituency issues, and
view aggregate engagement analytics — across multiple organisations on one
shared platform.

It has two product experiences plus a mobile application:

| Experience          | Audience                 | Design bias  |
| ------------------- | ------------------------ | ------------ |
| **Public website**  | Citizens                 | Mobile-first |
| **Campaign console**| Authorised campaign staff| Desktop-first|
| **Mobile app**      | Authorised campaign staff| Native       |

Phase 1 builds the scaffolding all of that will sit on: monorepo, GraphQL API,
PostgreSQL + Prisma, design tokens, shared packages, logging, error handling,
security, testing and CI.

## 2. Architecture

A **modular monolith in a monorepo**. One deployable API process, internally
divided into feature modules; one React web app; one React Native app; shared
code in versioned workspace packages.

```
 apps/web  (React + Vite)  ─┐
                            ├─ HTTP/GraphQL ─▶  apps/api  ─ Prisma ─▶  PostgreSQL
 apps/mobile (React Native)─┘                 (modular monolith)
                    ▲
                    └── packages/{types,config,utils,design-tokens,graphql,ui}
```

Deliberately **not** microservices. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the full rationale, the module pattern and the multi-tenancy approach.

## 3. Technology stack

| Concern          | Choice                                        |
| ---------------- | --------------------------------------------- |
| Language         | TypeScript 5.9 (strict)                       |
| Web              | React 19, Vite 7, React Router 7              |
| API              | Node.js 20+, Express 5, Apollo Server 5       |
| API contract     | GraphQL 16                                    |
| Database         | PostgreSQL 17 on **Neon** (hosted)            |
| ORM              | Prisma 7 (with the `@prisma/adapter-pg` driver adapter) |
| Mobile           | React Native 0.86 via Expo SDK 57, React Navigation 7 |
| Auth             | JWT (jose) + rotating opaque refresh sessions |
| Password hashing | Argon2id (`@node-rs/argon2`)                  |
| Validation       | Zod 4                                         |
| Logging          | Pino 10                                       |
| Testing          | Vitest 4, Testing Library, Supertest          |
| Tooling          | ESLint 9 (flat config), Prettier 3, tsup      |
| Packages         | npm workspaces                                |

## 4. Repository structure

```
.
├── apps/
│   ├── api/                  GraphQL API (modular monolith)
│   │   ├── prisma/           schema, migrations, seed  (backend-owned)
│   │   └── src/
│   │       ├── config/       validated environment + service identity
│   │       ├── database/     Prisma client singleton
│   │       ├── errors/       AppError, HTTP + GraphQL error formatting
│   │       ├── graphql/      schema assembly, resolvers, context, plugins
│   │       ├── logging/      structured logger
│   │       ├── middleware/   request context, security, CORS, rate limit
│   │       └── modules/      feature modules (Phase 1: health only)
│   ├── web/                  React web app (public site + admin shell)
│   └── mobile/               React Native (Expo) application shell
├── packages/
│   ├── config/               env parsing/validation + shared constants
│   ├── design-tokens/        THE source of truth for the visual system
│   ├── graphql/              GraphQL SDL + client operation documents
│   ├── types/                shared TypeScript types
│   ├── ui/                   React (web) design-system primitives
│   └── utils/                framework-agnostic utilities
├── docs/
│   ├── ARCHITECTURE.md
│   ├── AUTHENTICATION.md
│   ├── CONTENT.md
│   ├── ISSUES_AND_FEEDBACK.md
│   ├── PHASES.md
│   └── QR_CAMPAIGNS.md
├── scripts/doctor.mjs        environment diagnostics
├── .github/workflows/ci.yml
└── docker-compose.yml        PostgreSQL (+ Redis placeholder)
```

> **Note on `prisma/`:** the spec sketched a root-level `/prisma`. It lives at
> `apps/api/prisma/` instead, because the database schema is owned by the
> backend — the only tier permitted to talk to PostgreSQL. Keeping the schema,
> migrations and seed beside the code that uses them keeps that ownership
> boundary enforceable rather than conventional.

## 5. Prerequisites

- **Node.js 20.11+** (this repo is developed on 22/24; see `.nvmrc`)
- **npm 10+**
- A **Neon** account and project (the platform's PostgreSQL is hosted there).
  Docker is **not** required — see [Docker setup](#8-docker-setup-optional) for
  the optional offline alternative.
- For the mobile app: the **Expo Go** app on a device, or an Android/iOS
  emulator. Not required for web or API work.

Run `npm run doctor` at any time to check your machine.

## 6. Environment setup

```bash
git clone <repository-url>
cd Campaign-Intelligence-Platform

npm install          # also generates the design-token CSS

cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env

npm run doctor       # confirms everything above
```

`.env.example` files are committed; `.env` files are git-ignored. **Never commit
real credentials.** Every variable is validated at startup — a missing or
malformed value stops the process with a message naming the variable.

| File                  | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `.env`                | Optional local Docker stack only                 |
| `apps/api/.env`       | API: **Neon** connection strings, port, CORS, logging, limits |
| `apps/web/.env`       | Web: `VITE_API_URL` (public — never secrets)     |
| `apps/mobile/.env`    | Mobile: `EXPO_PUBLIC_API_URL` (public)           |

## 7. Database setup (Neon)

PostgreSQL is hosted on **Neon**. There is nothing to install.

### Two connection strings, and why

Copy **both** from the Neon console (*Connect*) or `neon connection-string`,
into `apps/api/.env`:

| Variable                | Endpoint | Hostname          | Used for                        |
| ----------------------- | -------- | ----------------- | ------------------------------- |
| `DATABASE_URL`          | Pooled   | contains `-pooler`| Application queries at runtime  |
| `DATABASE_URL_UNPOOLED` | Direct   | **no** `-pooler`  | Migrations, seeding, dumps      |

The pooled endpoint runs PgBouncer in transaction mode, which does not preserve
session state. That is exactly right for ordinary queries and **wrong for schema
migrations** — Prisma Migrate reuses prepared statements and session settings,
and over a pooled connection that fails with errors such as
`prepared statement "s0" already exists`, which never mention pooling. The
project routes each workload to the correct endpoint automatically
([`apps/api/src/config/databaseUrl.ts`](apps/api/src/config/databaseUrl.ts)) —
you only have to set both variables.

### TLS

Append `?sslmode=verify-full&channel_binding=require`. Startup validation
**rejects** any non-local `DATABASE_URL` without an `sslmode`, so credentials
cannot cross the internet unencrypted by accident.

Use `verify-full` rather than `require`: the `pg` driver currently treats
`require` as full verification, but that changes to weaker libpq semantics in
pg v9 — being explicit keeps the strong behaviour across that upgrade.

### Apply the schema

```bash
npm run db:migrate     # create/apply migrations   (uses the DIRECT endpoint)
npm run db:seed        # roles + demo org, user and membership
npm run doctor         # validates your Neon configuration
```

Verify: `curl http://localhost:4000/health/db` should return `"status":"OK"`.

> **Cold starts.** Neon suspends idle computes, so the first query after a quiet
> period takes noticeably longer. The health probe therefore allows 10s by
> default (`DATABASE_PROBE_TIMEOUT_MS`) so an idle-but-healthy database is not
> reported as an outage.

> **Never commit credentials.** `.env` files are git-ignored; only
> `.env.example` (which contains placeholders) is committed.

### Branching

Neon branches are instant copy-on-write clones with their own endpoint. Create
one per developer or per pull request and point `apps/api/.env` at it, so schema
work and `npm run db:reset` never touch shared data.

## 8. Docker setup (optional)

**You do not need Docker when using Neon.** `docker-compose.yml` exists only as
an offline fallback — a plane, a restrictive network, or a throwaway database
you want to reset freely.

To use it, start the container and switch `DATABASE_URL` to the commented local
line in `apps/api/.env.example` (leave `DATABASE_URL_UNPOOLED` unset — a local
server has no pooled/direct split).

| Action           | Command                                        |
| ---------------- | ---------------------------------------------- |
| Start PostgreSQL | `npm run db:up`                                |
| Stop             | `npm run db:down`                              |
| Inspect logs     | `npm run db:logs`                              |
| Reset the DB     | `npm run db:reset` (drops, re-migrates, seeds) |
| Destroy the volume | `docker compose down -v` — **deletes all local data** |

Data persists in the named Docker volume `rk_postgres_data`. The container is
mapped to host port **55432**, not 5432, so it cannot collide with a PostgreSQL
already installed natively on your machine.

Redis is defined as a **placeholder only**, behind the `optional` profile, and
is not started by default. No application code uses it in Phase 1.

## 9. Running the API

```bash
npm run dev:api      # tsx watch, http://localhost:4000
```

- GraphQL: <http://localhost:4000/graphql> (IDE enabled outside production)
- Health: <http://localhost:4000/health>
- Database health: <http://localhost:4000/health/db>

## 10. Running the web app

```bash
npm run dev:web      # Vite, http://localhost:5173
```

Or run both together from the repository root:

```bash
npm run dev          # API + web in parallel
```

The landing page performs a live GraphQL `health` query against the API, so it
doubles as an end-to-end connectivity check.

## 11. Running the mobile app

```bash
npm run dev:mobile   # expo start
```

Then scan the QR code with Expo Go, or press `a` / `i` for an emulator.

> `localhost` inside a device or emulator is the device itself. Set
> `EXPO_PUBLIC_API_URL` to your machine's LAN address (or `http://10.0.2.2:4000`
> on the Android emulator) when you start calling the API in later phases.

## 12. Running tests

```bash
npm test                      # every workspace
npm test -w @rk/api           # one workspace
npm run test:watch            # API in watch mode
```

The API's database tests run against a live PostgreSQL when one is reachable and
are **skipped** (not failed) when it is not, so unit tests work before you
provision infrastructure. CI always starts PostgreSQL, so they always execute
there.

## 13. Running lint

```bash
npm run lint
npm run lint:fix
```

## 14. Running type-check and formatting

```bash
npm run typecheck      # tsc --noEmit in every workspace
npm run format         # write Prettier formatting
npm run format:check   # verify only (used by CI)
```

Run everything CI runs, in one command:

```bash
npm run verify         # tokens + format + lint + typecheck + test
```

## 15. Prisma commands

| Command                     | Effect                                        |
| --------------------------- | --------------------------------------------- |
| `npm run db:generate`       | Regenerate the Prisma client                  |
| `npm run db:migrate`        | Create and apply a migration (uses the direct endpoint) |
| `npm run db:migrate:deploy` | Apply pending migrations (CI/production)      |
| `npm run db:seed`           | Run the idempotent seed script                |
| `npm run db:reset`          | Drop, re-migrate and re-seed (**destructive**)|
| `npm run db:studio`         | Open Prisma Studio                            |

Regenerate the client after **any** schema change.

> Prisma 7 note: the connection URL no longer lives in `schema.prisma`. The CLI
> reads it from `apps/api/prisma.config.ts`; the runtime client receives it via
> the `PrismaPg` driver adapter. Both read the same `DATABASE_URL`.

## 16. GraphQL endpoint

`POST http://localhost:4000/graphql`

```graphql
query {
  health
}
```

```json
{ "data": { "health": "OK" } }
```

A richer readiness query is also available:

```graphql
query {
  healthDetails {
    status
    service
    version
    environment
    uptimeSeconds
    dependencies {
      name
      status
      latencyMs
    }
  }
}
```

The SDL lives in `packages/graphql` — one source of truth shared by the server
and its clients. Resolvers live in `apps/api/src/graphql` and the modules.

## 17. Development workflow

1. Ensure `apps/api/.env` has your Neon connection strings and a `JWT_SECRET`
   (`npm run doctor`, then `openssl rand -base64 48`).
2. `npm run db:migrate && npm run db:seed` — roles, permissions and (if
   `SEED_SUPER_ADMIN_*` are set) a bootstrap administrator.
3. `npm run dev` — start API and web together, then sign in at
   <http://localhost:5173/login>.
3. Write code. Adding an API feature module? Follow the pattern documented in
   [`apps/api/src/modules/README.md`](apps/api/src/modules/README.md):
   **resolver/route → service → repository → database.**
4. Changing the visual system? Edit `packages/design-tokens/src/tokens.ts` and
   run `npm run tokens:build`. Never hard-code a hex value in a component.
5. `npm run verify` before pushing.

## 18. Implemented scope

**Phase 9 — Verified Work, Evidence & Public Transparency**

- Evidence as first-class data: type classification, document provenance
  (reference number, issuing authority, date), photograph capture metadata, and
  per-item visibility that defaults to internal
- Verification workflow — submit, assign, verify or reject with a required
  reason, withdraw — over both development projects and achievements, with an
  append-only history that survives reversals
- Any material change to evidence on a decided claim returns it to review, so a
  badge can never outlive the evidence it was granted against
- Public works listing at `/work` (status, category, area, year, verified-only
  and text filters, all server-side) and work detail with a progress timeline
  and an evidence gallery grouped before / during / after
- Public transparency page at `/transparency`: counters, evidence coverage and
  category breakdown, every figure a database count
- Verification console at `/admin/verification`, oldest-first
- Claim, evidence, verification and publication stay four separate acts:
  attaching a document verifies nothing, verifying does not publish, and an
  unverified claim carries no badge
- The verification badge never implies government endorsement or external audit
- Private evidence documents are no longer served to anonymous callers — a
  pre-existing gap in the media route, closed here
- See [docs/PHASE_9_VERIFIED_WORK.md](docs/PHASE_9_VERIFIED_WORK.md)

**Phase 8 — Citizen Engagement, Issue Follow-Up & Public Communication**

- Secure tracking tokens: 32 random bytes issued once at submission, stored as
  a SHA-256 digest only, never recoverable afterwards
- Public issue timeline and published-update feed on `/track`; the reference
  alone reads, the token is required to attach an address or write anything
- Public updates with a `DRAFT → PUBLISHED → ARCHIVED` lifecycle and corrections
  that supersede rather than rewrite — a separate table from internal history,
  so nothing internal can leak through a mis-defaulted flag
- Notification pipeline with a provider seam, five fixed templates, an output
  variable allow-list, consent re-checked at send time, idempotency enforced by
  a unique constraint, a retry ceiling and a per-issue daily ceiling
- Per-submission consent with a working unsubscribe path; recipient addresses
  are masked everywhere staff can see them
- Citizen follow-up on resolved submissions and a staff reopen-review queue;
  recording a decision never changes an issue's status by itself
- Communication centre at `/admin/communications`; 4 permissions separating
  reading from publishing from sending from reviewing
- See [docs/PHASE_8_COMMUNICATION.md](docs/PHASE_8_COMMUNICATION.md)

**Phase 7 — Decision Analytics & Geographic Intelligence**

- Decision dashboard at `/admin/analytics` with nine sections and one shared
  filter layer, so every metric on the page agrees
- Trend, category, status and priority breakdowns with period comparison
- Geographic rollup by ward, locality or area; attention rankings; area detail
- Resolution performance, backlog aging and a high-priority worklist
- Phase 6 themes and Phase 4 channel attribution recounted inside the filter
- Filters persisted in the URL; aggregate CSV export behind its own permission
- Every figure is a database `count` or `groupBy`; no issue rows reach the
  browser, and an undefined rate renders as an em dash rather than 0%
- See [docs/PHASE_7_ANALYTICS.md](docs/PHASE_7_ANALYTICS.md)

**Phase 6 — AI Issue Intelligence & Summarization**

- Provider abstraction with OpenAI and mock adapters; the mock runs the console
  and the whole test suite without a key or a network call
- Per-issue summary, subject-matter topics, category suggestion and similar-
  submission suggestions; aggregate themes and period executive summaries
- Human review throughout: approve, edit, reject, regenerate
- AI output is never authoritative — the issue's own title, description and
  category are untouched by every code path in the phase
- Citizen submission never waits on a model; 5 permissions and tenant budgets
- See [docs/PHASE_6_AI_INTELLIGENCE.md](docs/PHASE_6_AI_INTELLIGENCE.md)

**Phase 5 — Citizen Feedback + Issue Reporting**

- Public feedback form at `/feedback`: feedback, issues, suggestions and
  complaints, with optional location, photographs and contact details
- Anonymous by default; contact details opt-in, with consent recorded, and the
  server clears them rather than trusting the client
- Random reference number (`ISS-2026-7F3K9XQ2`) and public status tracking at
  `/track`, exposing six fields and nothing else
- Admin inbox with server-side filters, search and paging; detail page with the
  status workflow, priority, assignment, moderation, internal notes and timeline
- Aggregate analytics by status, category, ward, source, type and priority
- Attachments validated by magic bytes, size-capped for mobile data, and served
  only to authenticated staff holding the attachment permission
- 12 permissions separating the backlog from the citizen's contact details from
  staff notes; revealing contact details is audited
- QR attribution carried from Phase 4, verified against the same tenant
- See [docs/ISSUES_AND_FEEDBACK.md](docs/ISSUES_AND_FEEDBACK.md)

**Phase 4 — QR Campaign Platform**

- QR campaigns and QR codes, with independent lifecycles; archive rather than
  delete, because a printed code cannot be recalled
- Public redirect `GET /q/:code` — anonymous, fast, and it never waits for the
  analytics write
- Server-rendered QR assets (PNG, SVG) plus an A4 print sheet
- Aggregate analytics: trend and breakdowns by code, source, area, ward,
  device, weekday and time bucket; date presets and a bounded custom range
- Aggregate CSV export containing no personal data
- 10 QR permissions separating viewing from analytics from lifecycle control
- Destination allow-list: internal paths only, so a printed code cannot be
  repointed off-site
- Privacy: no IP, raw User-Agent or referrer URL is stored; unique estimation
  uses a daily-rotating salted hash that cannot be linked across days
- See [docs/QR_CAMPAIGNS.md](docs/QR_CAMPAIGNS.md)

**Phase 3 — Public Candidate Website + CMS**

- Public candidate site: homepage, work, vision, achievements, news, events,
  gallery, about, contact, search, privacy, terms, detail pages and a 404
- CMS for projects, achievements, news, events, priorities, gallery, media and
  the candidate/vision/contact singletons
- Publishing workflow (`DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED`), kept separate
  from domain status and from achievement verification
- 28 generated CMS permissions plus 5 specials; editing is separable from
  publishing
- Media library with magic-byte validation (SVG excluded); rich text sanitised
  on write against an allow-list
- English and Kannada content, with independent publishing per language
- Demo seed across two organisations, in both languages
- See [docs/CONTENT.md](docs/CONTENT.md)

**Phase 2 — Authentication, Multi-Tenancy & RBAC**

- Argon2id passwords, policy, change and single-use reset
- Rotating refresh sessions with replay detection; immediate revocation
- 8 roles / 20 permissions; permission-based authorization with escalation guards
- Strict tenant isolation enforced server-side on every query
- User, membership, organisation and campaign administration
- Append-only audit trail with metadata sanitisation
- Admin web login, route guard and session restore; React Native auth on
  platform secure storage
- See [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md)

**Phase 1 — Foundation & Architecture**

- npm-workspaces monorepo with six shared packages
- React web application: routing, layouts, placeholder public and admin routes
- Node.js + Express 5 + Apollo Server 5 GraphQL API
- PostgreSQL on Neon; Prisma schema, migration, seed and reset
- React Native (Expo) application shell with navigation and theming
- Centralised design tokens generating CSS custom properties
- Reusable UI primitives: Button, Card, Field, Input, Select, Badge,
  Spinner/LoadingState, ErrorState
- Structured logging with redaction and request correlation ids
- Centralised error handling for both HTTP and GraphQL
- Security foundations: Helmet headers, CORS allow-list, body size limits,
  rate limiting, startup environment validation
- REST `/health`, `/health/db` and GraphQL `health` / `healthDetails`
- Testing foundation across API, web, and packages
- ESLint, Prettier, strict TypeScript, CI workflow, documentation

## 19. NOT implemented yet

Deliberately absent. Do not add these without moving to the relevant phase —
see [docs/PHASES.md](docs/PHASES.md).

- Geographic issue map with boundary overlays and heat density — the platform
  stores no boundary data, so Phase 7 shipped ranked area analytics instead
- Admin campaign command centre — deferred twice and now unnumbered; most of its
  reporting arrived with Phase 7 and its content and staff surfaces with
  Phases 2–3
- React Native business features — deferred when verified work took the Phase 9
  slot; the Phase 1 Expo shell and Phase 2 device authentication are in place
  and unused
- Payments, subscription billing, production deployment *(Phase 10)*

Within Phase 3, these were deliberately not built: scheduled publishing,
content revision history, preview of an unpublished page, image resizing, a
Kannada admin interface (content is bilingual, the CMS chrome is not), and an
in-app navigation guard for unsaved form changes. See
[docs/CONTENT.md](docs/CONTENT.md) §9.

Within Phase 4, these were deliberately not built: a scan-retention deletion
job (the policy is configured, nothing prunes yet), external QR destinations,
scheduled activation, and conversion tracking past the landing page. See
[docs/QR_CAMPAIGNS.md](docs/QR_CAMPAIGNS.md) §13.

Within Phase 5, these were deliberately not built: a retention or deletion job,
admin-side logging of a phoned-in issue, duplicate detection, a map picker, and
a category-management screen. (Citizen notifications were also absent here and
arrived with Phase 8.) Search covers the reference and title
but never the description, which is a restriction rather than a gap. See
[docs/ISSUES_AND_FEEDBACK.md](docs/ISSUES_AND_FEEDBACK.md) §20.

Within Phase 9, these were deliberately not built: AI assistance of any kind
(the Phase 6 assistant is not wired into evidence or verification at all),
evidence versioning, enforcement of separation of duties within a single role,
a rich evidence-authoring screen, and a public map. Content-quality validation
exists and is tested but is not yet enforced at publication. See
[docs/PHASE_9_VERIFIED_WORK.md](docs/PHASE_9_VERIFIED_WORK.md) §19.

Within Phase 8, the SMTP adapter is declared and wired but **not implemented**,
so no deployment can currently email a citizen — only the `log` provider
delivers anywhere. SMS is an enum member with no provider, the queue is
in-process and non-durable, tracking tokens neither expire nor rotate, and no
provider in use reports delivery confirmation or bounces. See
[docs/PHASE_8_COMMUNICATION.md](docs/PHASE_8_COMMUNICATION.md) §15.

Also permanently out of scope, by product policy: political profiling, hidden
supporter/opponent scoring, voter identification, inferring political belief
from anything a citizen submits, and scraping Instagram, Facebook, ShareChat or
any other platform. Citizen analytics are aggregate by construction — see
[docs/QR_CAMPAIGNS.md](docs/QR_CAMPAIGNS.md) §14 and
[docs/ISSUES_AND_FEEDBACK.md](docs/ISSUES_AND_FEEDBACK.md) §21, which the RBAC
test suite enforces by asserting no `SUPPORTER_`, `VOTER_` or `PROFILING_`
permission can exist.

## 20. Licence

UNLICENSED — private and proprietary.
