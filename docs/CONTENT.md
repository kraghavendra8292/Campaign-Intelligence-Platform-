# Content, Publishing and Localisation

The Phase 3 model: how content is stored, how it becomes public, and how the two
languages relate. Companion to [AUTHENTICATION.md](./AUTHENTICATION.md), which
covers identity, tenancy and RBAC — none of which Phase 3 re-implements.

---

## 1. The shape of a content row

Every content table carries the same three coordinates:

```
(organizationId, slug, locale)   ← unique together
```

`organizationId` is the tenant. `slug` is the public web address. `locale` is
the language. Together they identify exactly one record, which has two
consequences worth stating plainly:

- Two tenants may use the same slug. They are different rows and neither can see
  the other.
- A translation is a **sibling row**, not a column on the original.

## 2. Four statuses, and what each one is not

```
DRAFT ──▶ IN_REVIEW ──▶ PUBLISHED ──▶ ARCHIVED
  ▲            │             │             │
  └────────────┴─────────────┴─────────────┘
             (back to draft / unpublish)
```

`ContentStatus` answers one question: *may the public see this?* It is
deliberately kept apart from two things it is often confused with.

**Domain status** is what the thing is doing in the world — a project is
`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `ON_HOLD` or `CANCELLED`. A completed
project can be an unpublished draft; a published one can still be in progress.
Collapsing these would make it impossible to prepare an announcement in advance.

**Verification** is whether a claim has been substantiated — `UNVERIFIED` or
`VERIFIED`, with evidence attached. Publishing does not verify, and verifying
does not publish. For a platform that makes claims about public works, an
editor must never be able to make something *look* substantiated by making it
visible.

## 3. The publishing boundary

There is exactly one:

```ts
function publicScope(tenant: PublicTenant, locale: Locale) {
  return { organizationId: tenant.organizationId, locale, status: 'PUBLISHED' } as const;
}
```

Every public read goes through it. Listings and direct slug lookups use the same
scope, so "can an unpublished row be reached by guessing its URL?" has the same
answer as "can it appear in a list" — and both are checked in one place rather
than in each of a dozen resolvers.

An unpublished slug returns `NOT_FOUND`, identical to a slug that was never
created. A visitor cannot use the error to learn that a draft exists.

## 4. Tenant resolution on the public site

The public site is anonymous, so there is no session to read a tenant from. The
browser asks for one; the server decides what it may have:

1. `?org=<slug>` — development and previews
2. subdomain — `<slug>.example.com`
3. `VITE_DEFAULT_SITE_SLUG` — single-tenant deployments

Whatever this produces is a **request, not a grant**. The API validates the slug
and serves nothing but that tenant's published content, so editing the query
string shows a different public site and never private data. An unknown slug is
`NOT_FOUND`.

This is a different mechanism from the admin console, which resolves its tenant
from the authenticated session's memberships and validates `x-organization-id`
against them. The two never share a path.

## 5. Localisation

English and Kannada are supported end to end:

| Layer                   | State                                                |
| ----------------------- | ---------------------------------------------------- |
| Database                | `locale` on every content row, part of the unique key |
| Public API              | `locale` on every query, defaulting to `en`           |
| Public site             | Language switcher; interface strings translated       |
| CMS API                 | `locale` on every query and every input               |
| CMS interface           | Editing-language switch on every localised screen     |
| CMS interface *chrome*  | **English only** — labels, buttons, help text         |

Because translations are separate rows, **publishing is independent per
language**. A Kannada translation can stay in draft while the English original
is live; publishing one does not publish the other. This is why the CMS has an
editing-language switch rather than paired fields on a single form: paired
fields would force both languages to share one status.

A page with no row in the requested language is **not** silently replaced with
the other language. The site shows its empty state. Substituting English for
missing Kannada would tell a reader the campaign has published something in
their language when it has not.

The demo seed reflects this on purpose: the Kannada site has fewer projects than
the English one, and one Kannada translation is left in draft.

## 6. Rich text

CMS HTML is sanitised **on write**, against an allow-list, in
`modules/content/shared/sanitize.ts`:

- A fixed tag and attribute allow-list. No `<script>`, no `<style>`, no event
  handlers, no inline styles.
- No `<h1>`: the page supplies its own, and a second one breaks the document
  outline for screen readers.
- Links get `rel="noopener noreferrer nofollow"` and are restricted to `http`
  and `https` — `javascript:` and `data:` URLs are rejected.

Sanitising on write rather than on render means the database never holds unsafe
markup, so a future consumer that forgets to sanitise cannot reintroduce the
hole. The web renders it through one `RichText` component.

## 7. Media

Uploads go over REST (`POST /media/upload`) rather than GraphQL, because
multipart through GraphQL needs a protocol extension while `FormData` is native.

- The format is determined by reading **magic bytes**. The `Content-Type` header
  and the file name are both attacker-controlled and are ignored for this
  decision.
- Accepted: JPEG, PNG, WebP, GIF, PDF. **SVG is excluded** — it is a document
  format that can carry script.
- Stored under a generated UUID key; the client's filename is kept only as a
  display label and never used as a path.
- Storage sits behind a `MediaStorage` interface. `LocalDiskStorage` is the
  development implementation; `S3CompatibleStorage` (Neon Object Storage /
  any S3-compatible host) is selected with `MEDIA_STORAGE_DRIVER=s3`. Callers
  only ever see an opaque `storageKey`.

Media is **not** localised. One library of files serves both languages.

## 8. Permissions

28 CMS permissions are generated as `ContentEntity × ContentAction`
(`PROJECT_CREATE`, `NEWS_PUBLISH`, …) rather than hand-listed, so adding an
entity cannot silently forget one. Five specials cover the cases that do not fit
the grid: `CONTENT_READ_UNPUBLISHED`, `ACHIEVEMENT_VERIFY`,
`CANDIDATE_PROFILE_UPDATE`, `VISION_UPDATE`, `CONTACT_UPDATE`.

The split that matters is **editing vs publishing**. `CONTENT_EDITING` and
`CONTENT_PUBLISHING` are separate sets, so a role can prepare content it cannot
make public. `SUBMIT_FOR_REVIEW` sits on the editing side — handing work over
for approval is ordinary editorial work, not a publishing act.

The admin interface hides controls a user lacks, and the API enforces the same
rule independently. The interface is a convenience; the API is the authority.

## 9. What Phase 3 does not do

Recorded so they are chosen, not discovered:

- **No scheduled publishing.** A future-dated `publishedAt` is stored but nothing
  promotes a draft on a timer. Publishing is an explicit act.
- **No content versioning or revision history.** An edit overwrites. Recovering
  a previous wording means restoring from a database backup.
- **No preview of an unpublished page.** Reviewers see the editor form, not a
  rendered draft of the public page.
- **No image derivatives.** Originals are served at their uploaded size; there
  is no resizing or format conversion pipeline.
- **CMS chrome is English only.** Content is fully bilingual; the buttons and
  labels around it are not.
- **No in-app navigation guard on unsaved changes.** `beforeunload` covers tab
  closes and reloads, but React Router navigation is not blocked.
