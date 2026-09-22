# Authentication, Multi-Tenancy & RBAC (Phase 2)

Reference for the security model. Architecture context lives in
[ARCHITECTURE.md](./ARCHITECTURE.md); phase boundaries in [PHASES.md](./PHASES.md).

---

## 1. Model at a glance

```
User ──< OrganizationMembership >── Organization ──< Campaign
 │              │                        │
 │              └── Role ──< RolePermission >── Permission
 │
 ├──< PlatformRoleAssignment >── Role        (SUPER_ADMIN only)
 ├──< Session                                 (refresh tokens, hashed)
 ├──< PasswordResetToken                      (hashed, single-use)
 └──< AuditLog                                (append-only)
```

**Organization is the tenant.** Campaign is a sub-scope *inside* a tenant, never
a tenant of its own — every campaign query still filters by `organizationId`.

A user may belong to many organisations, with a different role in each. Their
authority is therefore a function of *(user, organisation)*, resolved per
request, never a property of the user alone.

## 2. Credentials

| Credential | Form | Lifetime | Storage | Revocable |
| ---------- | ---- | -------- | ------- | --------- |
| Access token | signed JWT (HS256) | 15 min | web: memory; mobile: memory | indirectly |
| Refresh token | 256-bit opaque random | 30 days | web: HttpOnly cookie; mobile: OS keystore | yes |
| Reset token | 256-bit opaque random | 1 hour | SHA-256 digest in DB | single-use |
| Invitation | 256-bit opaque random | 7 days | SHA-256 digest in DB | single-use |

**Why two kinds.** The access token is stateless so it verifies without a
database round trip, which is why it is short-lived: it cannot be individually
revoked. The refresh token is opaque and carries no claims — it is a lookup key
into `sessions`, so it *is* revocable and rotatable.

**Why SHA-256 for tokens but Argon2id for passwords.** A 256-bit random token
has nothing to brute-force, so a slow KDF would only add latency to every
refresh. A password has low entropy, so the hash must be deliberately expensive.

**The access token carries identity only** — `sub` (user) and `sid` (session).
No email, no roles, no permissions. A JWT is signed but not encrypted, so its
contents are readable by anyone holding it; and cached authority would keep
working after a role was revoked.

## 3. Request flow

Every request rebuilds authority from the database:

```
Authorization: Bearer <access token>
        │
        ├─ 1. verify JWT        signature, issuer, audience, expiry, typ=access
        ├─ 2. load session      must exist, be unrevoked and unexpired
        ├─ 3. load user         must exist and be ACTIVE
        ├─ 4. check epoch       session newer than user.tokenValidFrom
        ├─ 5. resolve tenant    x-organization-id validated against memberships
        └─ 6. resolve authority roles → permissions (DB is authoritative)
                │
                └─► context.auth : AuthContext | null
```

Any failure yields an **anonymous context**, not an error, so an expired token
behaves exactly like no token and resolvers have one "not signed in" path.

Steps 2 and 3 are what make revocation immediate: suspending an account or
revoking a session stops the *existing* access token on its next call, rather
than when it expires.

### The tenant boundary

`x-organization-id` is an untrusted request header. It is accepted **only** after
proving the caller holds a membership in that organisation. An unrecognised or
unauthorised value resolves to `null` — no tenant — so probing for valid
organisation ids returns the same result whether or not the id exists.

With no header and exactly one membership, that tenant is selected. With several,
the client must choose; the server does not guess.

A platform admin (SUPER_ADMIN) may act in any organisation, so for them the
header is validated for existence only.

## 4. Roles and permissions

Authorization is evaluated on **permissions**, never on role names. Roles exist
to bundle permissions and to bound escalation.

| Role | Rank | Scope | Summary |
| ---- | ---- | ----- | ------- |
| `SUPER_ADMIN` | 100 | platform | Everything, across all tenants |
| `CAMPAIGN_ADMIN` | 80 | organisation | Full administration of one tenant |
| `CANDIDATE` | 60 | organisation | Own account + read their organisation |
| `CONTENT_MANAGER` | 50 | organisation | Read users/org; runs the CMS and edits QR campaigns |
| `ISSUE_MANAGER` | 50 | organisation | Read users/org; full handling of citizen submissions, including contact details |
| `FIELD_COORDINATOR` | 40 | organisation | Read users/org; works submissions, but **not** citizen contact details |
| `ANALYST` | 30 | organisation | Read-only; **no** user access (analytics is aggregate) |
| `VIEWER` | 10 | organisation | Minimal read-only |

### Permission matrix

| Permission | SUPER | CAMP_ADMIN | CANDIDATE | CONTENT | ISSUE | FIELD | ANALYST | VIEWER |
| ---------- | :---: | :--------: | :-------: | :-----: | :---: | :---: | :-----: | :----: |
| USER_READ | ✓ | ✓ | | ✓ | ✓ | ✓ | | |
| USER_CREATE | ✓ | ✓ | | | | | | |
| USER_UPDATE | ✓ | ✓ | | | | | | |
| USER_DELETE | ✓ | | | | | | | |
| ROLE_READ | ✓ | ✓ | | ✓ | ✓ | | | |
| ROLE_ASSIGN | ✓ | ✓ | | | | | | |
| ROLE_REVOKE | ✓ | ✓ | | | | | | |
| ORGANIZATION_READ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ORGANIZATION_UPDATE | ✓ | ✓ | | | | | | |
| ORGANIZATION_CREATE | ✓ | | | | | | | |
| CAMPAIGN_READ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| CAMPAIGN_CREATE/UPDATE/DELETE | ✓ | ✓ | | | | | | |
| AUDIT_READ | ✓ | ✓ | | | | | | |
| SESSION_REVOKE_ANY | ✓ | ✓ | | | | | | |
| PROFILE_READ/UPDATE, SESSION_READ_OWN, SESSION_REVOKE_OWN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

The last row is a **baseline** granted to every authenticated user regardless of
role — otherwise a user belonging to no organisation could not read their own
profile or sign out of their own devices.

The matrix above covers the **access** permissions introduced in Phase 2. The
domain permissions added later are documented where they are used: CMS in
[CONTENT.md](CONTENT.md), QR in [QR_CAMPAIGNS.md](QR_CAMPAIGNS.md), and citizen
submissions in [ISSUES_AND_FEEDBACK.md](ISSUES_AND_FEEDBACK.md) — the last of
which explains why reading a submission, reading the citizen's phone number and
reading a colleague's internal note are three separate permissions.

Source of truth: `packages/types/src/permissions.ts`, seeded into
`permissions` / `role_permissions`. The database is authoritative at runtime;
the compiled matrix is the fallback for an unseeded environment.

### Escalation guard

1. `SUPER_ADMIN` is grantable only by a platform admin, and never through a
   tenant membership.
2. An actor may grant only a role ranked **strictly below** their own highest
   rank. Strictly below, so a `CAMPAIGN_ADMIN` cannot mint a peer.
3. Nobody may change their own roles or status.
4. Nobody may act on a target of equal or higher rank.

## 5. Session lifecycle and replay

Each login opens a session **family**. Refreshing rotates the token: the old row
is marked `rotatedAt` and linked to its replacement via `replacedById`.

```
login ──► session A ──refresh──► session B ──refresh──► session C
                │
                └── replayed ──► ENTIRE FAMILY REVOKED + audited
```

A refresh token is single-use, so presenting an already-rotated one means a copy
exists. Both the attacker and the legitimate user are logged out — the safe
outcome; the real user signs in again.

| Event | Sessions revoked |
| ----- | ---------------- |
| Logout | that session |
| Refresh rotation | the presented one |
| Replay detected | the whole family |
| Password **change** | all except the one performing it |
| Password **reset** | all, without exception |
| Suspend / disable | all |
| Role revoked | all |

Password *change* keeps the current session (you are present and authenticated);
password *reset* revokes everything (you may be resetting because an attacker
holds a session).

## 6. Password handling

- **Argon2id**, 19 MiB / t=2 / p=1 (OWASP baseline), via `@node-rs/argon2`
  (prebuilt binaries — no node-gyp).
- Policy is length-first (min 12, max 256), not a character-class maze: NIST
  800-63B found composition rules push users to predictable substitutions. The
  upper bound exists because Argon2 cost scales with input length.
- A password is never logged, returned, audited, or stored in any form but its
  digest.

**Account enumeration is closed.** Every credential failure returns exactly
`"Invalid email or password."` — unknown account, wrong password, and suspended
account are indistinguishable. Unknown accounts also burn comparable CPU
against a dummy hash, so response *timing* does not leak either. Account status
is checked only *after* the password verifies.

`requestPasswordReset` always succeeds, including for addresses that do not
exist and when the rate limit is exhausted.

## 7. Token storage

| Client | Access token | Refresh token | Rationale |
| ------ | ------------ | ------------- | --------- |
| Web | memory | HttpOnly cookie | Nothing readable by JS; XSS cannot exfiltrate the long-lived credential |
| Mobile | memory | `expo-secure-store` | Keychain / EncryptedSharedPreferences; AsyncStorage is plaintext on disk |

Neither client ever writes a credential to `localStorage`. The web app has no
refresh-token variable anywhere in its source: the browser attaches the cookie.

Cookie attributes: `HttpOnly`, `SameSite=Strict`, `Path=/graphql`,
`Secure` (mandatory in production — startup refuses otherwise).

## 8. CSRF

Layered, because `SameSite` is a same-*site* control and a sibling subdomain is
still same-site:

1. `SameSite=Strict` keeps the cookie off cross-site requests.
2. Apollo Server's CSRF prevention requires a preflighted content type, so a
   plain `<form>` POST cannot reach `/graphql` at all.
3. An `Origin` check on `login` and `refreshToken` rejects origins outside
   `CORS_ORIGINS`. A missing `Origin` is allowed — native and server-to-server
   clients omit it and are not subject to CSRF.

## 9. Audit

Append-only. No update or delete path exists in application code.

Recorded: login success/failure, logout, refresh, replay detection, password
change/reset, session revocation, user create/invite/update/activate/suspend/
disable, role assign/revoke, organisation and campaign changes.

Each row carries action, organisation, campaign, actor, entity, sanitised
metadata, IP, user agent, correlation id and timestamp.

**Metadata is sanitised twice**: credential-bearing keys (`password`, `token`,
`authorization`, `cookie`, …) are *dropped* outright, then the remainder passes
the shared redactor. References to users and organisations are nullable and
`ON DELETE SET NULL`, so removing a user cannot erase the record of what they
did.

Audit writes never fail a request — a lost row is preferable to a failed login,
and the failure is still visible in the application log.

Reading requires `AUDIT_READ` and is scoped to the caller's organisation.
Platform-level rows (`organizationId = null`) are visible only to platform admins.

## 10. Rate limiting

`AttemptLimiter` guards login (per email+IP), password reset (per email+IP) and
refresh (per IP).

> **Production requirement.** The default implementation is in-memory and does
> **not** coordinate across instances — two replicas each allow the full budget.
> A Redis-backed implementation must be supplied before horizontal scaling. The
> interface is the swap point; no call site changes.

## 11. GraphQL API

**Queries** — `me`, `mySessions`, `myMemberships`, `users`, `user`,
`organization`, `organizations`, `campaigns`, `campaign`, `assignableRoles`,
`auditLogs`

**Mutations** — `login`, `logout`, `refreshToken`, `requestPasswordReset`,
`confirmPasswordReset`, `changePassword`, `revokeSession`, `createUser`,
`updateUser`, `activateUser`, `suspendUser`, `disableUser`, `assignRole`,
`revokeRole`, `createOrganization`, `updateOrganization`, `createCampaign`,
`updateCampaign`, `archiveCampaign`

`me` returns `null` when signed out rather than erroring — "who am I" has an
answer. Everything else returns `UNAUTHENTICATED` or `FORBIDDEN`.

Cross-tenant ids return **`NOT_FOUND`**, not `FORBIDDEN`: the latter would
confirm the id exists somewhere.

`users` and `auditLogs` are cursor-paginated and capped at 100 per page.

## 12. Configuration

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `JWT_SECRET` | **none** | ≥32 chars. No default by design — a fallback would reach production |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `rk-campaign-api` / `rk-campaign-clients` | Both validated on every token |
| `ACCESS_TOKEN_TTL_SECONDS` | 900 | 60–3600 |
| `REFRESH_TOKEN_TTL_SECONDS` | 2592000 | 30 days |
| `PASSWORD_RESET_TTL_SECONDS` | 3600 | |
| `INVITATION_TTL_SECONDS` | 604800 | 7 days |
| `COOKIE_SECURE` | false | **must be true in production** |
| `COOKIE_SAMESITE` | strict | |
| `COOKIE_DOMAIN` | *(unset)* | Unset = host-only, the safest default |
| `PUBLIC_WEB_URL` | `http://localhost:5173` | Builds reset links |
| `PASSWORD_MIN_LENGTH` / `MAX` | 12 / 256 | |
| `AUTH_RATE_LIMIT_WINDOW_MS` | 900000 | |
| `AUTH_LOGIN_MAX_ATTEMPTS` | 10 | |
| `AUTH_DEV_EXPOSE_TOKENS` | false | **Refused in production** — logs live reset links |
| `SEED_SUPER_ADMIN_EMAIL` / `_PASSWORD` | *(unset)* | Seed-only; no bootstrap admin without both |

Production startup **fails** if `COOKIE_SECURE` is false, `AUTH_DEV_EXPOSE_TOKENS`
is true, `GRAPHQL_INTROSPECTION` is true, or `CORS_ORIGINS` contains an
`http://` origin.

## 13. Bootstrapping

`SUPER_ADMIN` cannot be granted through a tenant membership, so the first one
comes from the seed:

```bash
# apps/api/.env
SEED_SUPER_ADMIN_EMAIL=admin@example.com
SEED_SUPER_ADMIN_PASSWORD=<a strong password you choose>

npm run db:migrate && npm run db:seed
```

Without both variables the seed creates roles and permissions and skips the
admin. No password is ever hardcoded.

## 14. Known limitations

- **In-memory rate limiting** — see §10. Redis needed before multi-instance.
- **No email delivery.** Reset and invitation tokens are generated and stored;
  delivery is a service boundary with a development log adapter behind
  `AUTH_DEV_EXPOSE_TOKENS`. A real adapter is required before production.
- **Role→permission cache (60 s TTL).** Role *assignments* are never cached, so
  revoking a user's role is immediate; changing a role's *permission set* can
  take up to a minute to propagate.
- **No `CampaignMembership` enforcement yet.** The table and campaign scope
  exist and resolve; no Phase 2 operation is campaign-scoped, because no Phase 2
  resource belongs to a campaign. Phase 3+ business modules will use it.
- **Access tokens are not individually revocable** by design — bounded by a
  15-minute TTL plus the per-request session check.
