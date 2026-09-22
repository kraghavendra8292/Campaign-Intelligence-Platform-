# QR Campaigns

The Phase 4 model: how outreach channels are measured, what a scan records, and
what this system deliberately refuses to do. Companion to
[AUTHENTICATION.md](./AUTHENTICATION.md) (identity, tenancy, RBAC) and
[CONTENT.md](./CONTENT.md) (the public site a scan leads to). Phase 4
re-implements none of either.

---

## 1. Architecture

```
  Poster / pamphlet / banner / event
              │
         [ QR symbol ]
              │  citizen scans
              ▼
  GET /q/RK-QR-7F3K9XQ2                (API, public, no auth)
              │
    ┌─────────┴──────────┐
    │  QR resolution     │  one indexed lookup: code → tenant, status, path
    └─────────┬──────────┘
              │
    ┌─────────┴──────────┐
    │  scan event        │  started, NOT awaited
    └─────────┬──────────┘
              │
         302 redirect
              ▼
  Public website  /work/road-development?utm_source=qr&utm_medium=poster…
              │
              ▼
  Aggregate analytics   (admin, GraphQL, RBAC + tenant scoped)
```

Two request paths, and they share nothing but the database:

| | Public scan | Admin console |
|---|---|---|
| Protocol | REST (`GET /q/:code`) | GraphQL |
| Auth | None | Access token + tenant header |
| Tenant from | The code itself | The authenticated session |
| Returns | A redirect, or a notice page | Campaign data and aggregates |

The scan endpoint is REST because the response *is* an HTTP redirect.
Expressing that through GraphQL would mean fetching a URL and then navigating
to it — two round trips for somebody holding a phone up to a wall.

---

## 2. Campaign structure

A **QR campaign** is one measurable outreach push: a printing run, an event, a
door-to-door drive.

```
QrCampaign  "Ward 12 Development Awareness"   type: POSTER
  ├── QrCode  "12th Main Road Poster"    source: Poster    → /work
  ├── QrCode  "12th Main Road Pamphlet"  source: Pamphlet  → /achievements
  ├── QrCode  "Public Meeting QR"        source: Event     → /events
  └── QrCode  "Community Office QR"      source: Office    → /contact
```

Splitting one campaign across several codes is the entire point: it is what
lets the team answer "did the posters or the pamphlets do more?".

**Campaign statuses:** `DRAFT → ACTIVE → PAUSED → COMPLETED → ARCHIVED`.
Slugs are unique per tenant (`organizationId + slug`), matching Phase 2/3.

A campaign is always created as a **DRAFT**. Activation needs
`QR_CAMPAIGN_ARCHIVE`, so create-and-activate in one step is not possible.

**Campaign status does not gate redirects.** Completing a campaign is a
statement about its schedule, not an instruction to break every poster already
on a wall. Retiring a code is a separate, explicit act per code.

---

## 3. QR code structure

**Statuses:** `ACTIVE` (redirects) · `PAUSED` (notice) · `ARCHIVED` (notice).

There is deliberately **no delete**. A printed QR code cannot be un-printed, so
removing the row would turn every physical poster into a dead link. `ARCHIVED`
is the only retirement path, and an archived identifier keeps resolving to an
explanation forever.

A code is created **ACTIVE**, unlike a campaign: it does not exist physically
until somebody prints it, and an inactive code that gets printed by mistake is
a dead poster.

### The public identifier

```
RK-QR-7F3K9XQ2
└────┘ └──────┘
prefix  8 chars from 0-9 A-Z minus I, L, O, U
```

**Random, not sequential.** A sequential code would let anyone enumerate every
QR code on the platform, discover other tenants' campaigns, and inflate their
scan counts by walking the range. The alphabet excludes ambiguous glyphs so a
code read off a poster cannot be confused with `1` or `0`. Generated with
`crypto.randomInt`, and the database's unique index is the real guarantee.

Globally unique rather than per tenant, because the scan URL carries no tenant
of its own — the code alone must resolve the organisation.

---

## 4. Destinations and the open-redirect boundary

Destinations are **internal paths only**, validated by a single function:
`validateDestinationPath` in `modules/qr/shared/qrGuards.ts`.

Absolute external URLs are **not supported in Phase 4**. Storing one would turn
anybody holding `QR_CODE_UPDATE` into somebody who can repoint printed material
at any site on the internet, and no campaign requirement justifies that. If
external destinations are ever needed they belong behind their own permission
and their own host allow-list.

The validator is an **allow-list**, not a deny-list of dangerous schemes. Every
scheme deny-list misses an encoding eventually, and the cost of a miss here is
that a candidate's own printed codes send citizens to an attacker's page.

Rejected, each for a distinct bypass:

| Input | Why |
|---|---|
| `javascript:`, `data:`, `file:` | any colon means a scheme is being attempted |
| `https://evil.example` | absolute URL |
| `//evil.example` | protocol-relative — browsers treat it as absolute |
| `/work\..\..\windows` | some browsers normalise `\` to `/` |
| `/work/..%2f..%2fetc` | percent-encoding is rejected, never decoded |
| `/work/../../etc/passwd` | traversal |
| `/not-a-real-page` | root outside the allow-list |
| `/work?x=1`, `/work#y` | UTM is generated, not supplied |

Percent-encoding is rejected outright rather than decoded: decoding would mean
validating the decoded form and storing the original, and the gap between those
two strings is exactly where traversal bugs live.

The final URL is built with `new URL()` against a **server-configured origin**,
and the origin is then re-asserted. No combination of stored data can send a
citizen to another host.

---

## 5. Scan events: what is stored, and what is not

### Stored

| Field | Why |
|---|---|
| `organizationId`, `campaignId`, `qrCodeId` | which channel was scanned |
| `scannedAt`, `scanDate`, `scanHour`, `scanDayOfWeek` | aggregate timing; pre-bucketed so rollups are an indexed `GROUP BY` |
| `deviceCategory` | mobile/tablet/desktop/bot/unknown — informs how the site should be built |
| `osCategory` | family only, never a version |
| `referrerCategory` | direct/search/social/messaging/other |
| `isAutomated` | whether this was a crawler, so totals stay honest |
| `landingPath` | where the citizen was actually sent |
| `utm*` | the channel attribution carried downstream |
| `visitHash` | salted daily hash, for same-day repeat estimation only |

### Never stored

**IP address. Raw User-Agent. Referrer URL. Cookie. Account link. Location of
the person scanning. Any identifier that survives the day.**

The IP and User-Agent enter `modules/qr/shared/scanClassifier.ts` and only
enum members leave. That module is the privacy boundary; nothing downstream
ever sees the inputs, so a later change to analytics cannot start persisting
them by accident.

Also never stored, as a matter of product policy rather than implementation
detail: **name, email, phone, Aadhaar, voter ID, political preference,
supporter status, opponent status, or any individual profile.** There is no
column that could hold one, and the test suite asserts their absence.

---

## 6. The visit hash

**Purpose:** distinguishing "one person scanned twice" from "two people
scanned once", within a single day. That is the whole of it.

```
dailyKey  = HMAC-SHA256(JWT_SECRET, "qr-visit-salt|" + YYYY-MM-DD)
visitHash = HMAC-SHA256(dailyKey, qrCodeId + "|" + ip + "|" + userAgent)[0..32]
```

Four properties make it not an identifier:

1. **The salt rotates daily.** The same phone at the same poster produces a
   completely different value tomorrow, so nothing can be linked across days
   and no history of anyone can be built.
2. **The QR code id is mixed in.** The same phone at two posters produces
   unrelated values, so nothing can be linked across campaigns.
3. **It is an HMAC under a server-held key.** Possessing the stored value and
   guessing an IP does not confirm the guess.
4. **The IP is never stored** — it exists only as an argument.

It is never exposed by any GraphQL field, never exported, and is only ever fed
to a `groupBy` that counts buckets and discards them.

Controlled by `QR_UNIQUE_ESTIMATION` (default on). With it off, no hash is
computed and the estimate reports as **unavailable** — never as zero, which
would be a claim that nobody came.

---

## 7. Analytics

All aggregation happens **in the database**. Every figure comes from a `count`
or a `groupBy`; individual scan rows are never returned to a resolver, let
alone a browser. That makes per-person reconstruction structurally impossible
rather than merely discouraged.

**Metrics:** total scans, automated scans, estimated unique visits, scans
today / 7 days / 30 days, average per day, active and total codes, daily trend,
and breakdowns by QR code, source, area, ward, device, day of week and
time-of-day bucket.

**Ranges** are resolved server-side — a client computing "last 7 days" would
put the boundary in its own timezone, so two people looking at one dashboard
would see different totals. Custom ranges are capped at
`MAX_ANALYTICS_RANGE_DAYS` (400) and **rejected** rather than silently
narrowed.

### Attribution rollups

Source, area and ward live on the QR code, not copied onto every scan. Those
rollups group scans by `qrCodeId` and join to the code inventory in memory.

The trade-off, stated plainly: one source of truth for attribution, no write
amplification on the latency-critical redirect, and correcting a mis-typed ward
fixes that code's history rather than splitting it across two buckets. The cost
is that the joined set is bounded by how many codes a tenant owns. At the scale
Phase 4 targets — tens to low hundreds of codes — that is the right trade; at
tens of thousands it would need denormalising onto the scan row.

### Wording

Every figure says **"scans"**. A scan is an event. One person scanning twice
and two people scanning once are indistinguishable *by design*, so "1,248
people" would be a claim the data cannot support. A web test asserts that no
metric label ever says "people", "persons", "citizens" or "voters".

### Export

Aggregate CSV only: one row per **day per QR code**, with campaign, source,
area and ward. Never a row per scan, never an IP, never a visit hash. Cells are
quoted and leading `=`/`+`/`-`/`@` neutralised against spreadsheet formula
injection.

---

## 8. Bot and duplicate handling

Real QR links get pasted into WhatsApp, Slack and Twitter, each of which
fetches the destination to build a link preview. Counting those as scans would
mean one share looked like a dozen citizens.

Automated traffic is **stored and flagged**, not dropped — so totals stay
honest and "excluding automated traffic" can be offered truthfully. The
detection is signature-based on the User-Agent, which is best-effort: a
determined script can present any string it likes, and this system does not
claim to count humans.

---

## 9. Retention

| Question | Answer |
|---|---|
| What is stored | Section 5 |
| Why | Aggregate channel analytics — which outreach worked |
| How long | `QR_SCAN_RETENTION_DAYS`, default 400 days |
| Exposed to admins | Aggregates only; never a raw row |

**Phase 4 does not run a deletion job.** The setting is the documented policy
and the input a future retention task will read — declared now so the decision
lives in configuration rather than being implicit. This is stated as a known
limitation in section 13 rather than presented as implemented.

400 days is chosen so a campaign can compare this year against the same period
last year, and no longer.

---

## 10. QR generation

Rendered server-side with `qrcode`, at **error-correction level M** (~15%
damage tolerance) and a 4-module quiet zone.

M is chosen for print: a poster gets rained on and torn, so L would fail in
exactly those conditions; H survives more but makes the symbol denser, which
hurts a phone camera at distance — the far more common failure on a wall.

Delivered as **data on an authorised GraphQL field**, not from an image
endpoint, for two reasons: the admin access token lives in memory so an
`<img src>` would carry no credential, and one implementation means the symbol
on screen is the symbol that gets printed.

- **PNG** — 1024px data URL, for preview and download
- **SVG** — markup, for print at any size
- **Print sheet** — `/admin/qr-campaigns/:c/qr/:q/print`, an A4 page with the
  symbol, organisation, campaign, description and identifier. A `@media print`
  block hides the console chrome so the browser's own print dialog produces a
  clean sheet.

`QrCode.image` is a lazy field: a list of fifty codes must not rasterise fifty
PNGs to render fifty rows of text.

---

## 11. UTM strategy

Defaults are derived so the numbers mean something downstream without anyone
having to learn UTM conventions:

| Parameter | Default |
|---|---|
| `utm_source` | `qr` |
| `utm_medium` | the campaign type, lowercased (`poster`) |
| `utm_campaign` | the campaign slug |
| `utm_content` | the code's name, slugified |

Any of them can be overridden. Values are restricted to `A-Za-z0-9._~-` and
**rejected** rather than encoded, so what an editor types is what appears.

Since destinations are always internal paths and the origin is server-supplied,
appending UTM cannot create an open redirect.

---

## 12. Security

**RBAC.** 10 permissions, 8 generated from `QrEntity × QrAction` plus
`QR_ANALYTICS_READ` and `QR_CODE_DOWNLOAD`. The Phase 2 authorization service
is the only decision point; Phase 4 adds no second permission system.

Three separations that matter:

- **Viewing ≠ analytics.** A viewer may need to know a poster is still live
  without being shown how the campaign performed.
- **Editing ≠ lifecycle.** Drafting a code is ordinary work; activating one
  puts a live redirect behind something about to be printed, and pausing one
  silently breaks every poster already on a wall.
- **Downloading ≠ editing.** A field coordinator prints codes; they should not
  need the ability to repoint the code they are printing.

| Role | QR access |
|---|---|
| SUPER_ADMIN | everything |
| CAMPAIGN_ADMIN | read, author, lifecycle, download, analytics |
| CONTENT_MANAGER | read, author, download, analytics — **no lifecycle** |
| FIELD_COORDINATOR | read, download |
| ANALYST | read, analytics |
| CANDIDATE | read, analytics |
| VIEWER | read only |
| ISSUE_MANAGER | none |

**Tenant isolation.** Every admin query filters on the organisation resolved
from the authenticated session, in the `where` clause rather than checked
afterwards — a filter cannot be forgotten the way a post-hoc comparison can. A
cross-tenant id returns `NOT_FOUND`, not `FORBIDDEN`: a distinct "forbidden"
would confirm the id exists, turning the error into an enumeration oracle. For
public scans the tenant comes from the **code**, and a code belonging to a
suspended organisation returns the same `NOT_FOUND` as an unknown one.

**Rate limiting.** The scan endpoint carries its own limiter, deliberately
generous (600 per minute per IP by default): a public meeting or classroom
scanning one poster from behind a single NAT is legitimate traffic, and
throttling it would break the product for the people it is for. Combined with
the 8-character random code space, guessing a valid identifier at that rate is
not viable. A throttled citizen gets an HTML notice, not a JSON error body.

The store is in-memory, matching the Phase 1 global limiter — correct for one
process, and the single thing to swap for a multi-instance deployment.

**Audit.** Campaign and code creation, updates and status changes are recorded
through the Phase 2 audit trail. A destination change records the before and
after, because re-pointing a printed code is the highest-consequence edit
available. **Public scans are not audited** — writing millions of them would
drown the security record the trail exists to protect. Scans live in analytics.

---

## 13. Known limitations

Recorded so they are chosen, not discovered.

- **No retention job.** `QR_SCAN_RETENTION_DAYS` is policy and configuration;
  nothing deletes old rows yet.
- **No external destinations.** Internal paths only (section 4).
- **Scan writes are fire-and-forget.** The redirect does not wait for the
  insert, so a crash between the two loses a row. Acceptable for channel
  analytics; it would not be for billing.
- **Attribution is not point-in-time.** Editing a code's source or ward
  re-attributes its whole history (section 7).
- **Bot detection is signature-based.** A determined script can present any
  User-Agent. This system counts scans and does not claim to count humans.
- **Unique estimation is same-day only and approximate.** By design — see
  section 6. It is never presented as a visitor count.
- **No conversion tracking past the landing page.** The system records that a
  citizen was redirected, not what they did next. UTM parameters are attached
  so a future analytics layer could, but Phase 4 measures nothing on the
  public site itself.
- **Rate limiting is per process.** Same caveat as Phase 1.
- **The destination allow-list is maintained by hand.** Adding a public page
  means adding it to `ALLOWED_DESTINATION_ROOTS` — deliberate friction.
- **No scheduled activation.** Campaign start and end dates are descriptive;
  nothing switches a code on or off on a date.

---

## 14. Permanently out of scope

Not "a later phase" — never, by product policy. The RBAC test suite asserts
that no permission matching `SUPPORTER_`, `VOTER_` or `PROFILING_` exists.

- Determining whether anyone is a supporter, opponent, undecided or affiliated
- Support scores, likely-supporter fields, or individual political profiles
- Voter identification or individual political preference inference
- Face recognition
- Scraping Instagram, Facebook, ShareChat or any other platform
- Collecting social-media likes, followers or individual behaviour
- Joining QR data with external personal data

This system measures interactions with the campaign's own QR infrastructure and
website, in aggregate. It has no mechanism for anything above, and the data
model has no column that could hold one.
