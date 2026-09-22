# Phase 7 — Decision Analytics

How Phase 5 submissions, Phase 6 AI output and Phase 4 channel data become a
dashboard an administrator can act on, what each number means, and what the
dashboard refuses to say. Companion to
[ISSUES_AND_FEEDBACK.md](./ISSUES_AND_FEEDBACK.md) (the data),
[PHASE_6_AI_INTELLIGENCE.md](./PHASE_6_AI_INTELLIGENCE.md) (themes and topics),
[QR_CAMPAIGNS.md](./QR_CAMPAIGNS.md) (scans) and
[AUTHENTICATION.md](./AUTHENTICATION.md) (identity, tenancy, RBAC).

Phase 7 is additive and reimplements none of them. It reads what they wrote.

---

## 1. Architecture

```
            PHASE 5 submissions
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
  PHASE 6 AI    PHASE 4 QR    issue rows
   themes         scans        statuses
   topics                      areas
      └─────────────┼─────────────┘
                    ▼
         buildScope()  ← tenant + filters + period, ONE place
                    │
   ┌────────────┬───┴────┬──────────────┬───────────────┐
   ▼            ▼        ▼              ▼               ▼
 analytics   geo      resolution   intelligence      export
 .service  Analytics  Analytics     Analytics       .service
   │           │          │              │               │
   └───────────┴──────────┴──────────────┴───────────────┘
                    ▼
          analytics.resolvers.ts  (16 queries, all read-only)
                    ▼
            /admin/analytics
```

**`buildScope()` is the spine.** Every metric in the phase derives its `where`
clause from it. That is not tidiness — it is the only reliable way to stop the
overview card saying 428 while the category table adds up to 391. A dashboard
that disagrees with itself is one nobody trusts twice.

It is also where tenant isolation lives: `organizationId` comes from the
verified `AuthContext` and is written into the scope. No code path in the module
accepts one from a caller.

---

## 2. Modules

| Module | Responsibility |
| --- | --- |
| `shared/analyticsFilters.ts` | Filter → `where`, period resolution, previous window, `%`/rate helpers |
| `analytics.service.ts` | Overview, trend, category/status/priority, high-priority backlog |
| `geoAnalytics.service.ts` | Area rollup, area detail, attention rankings, area options |
| `resolutionAnalytics.service.ts` | Time-to-resolution, backlog aging, first response, slow categories |
| `intelligenceAnalytics.service.ts` | Phase 6 themes/topics, Phase 4 channel data, insight cards |
| `analyticsExport.service.ts` | Aggregate CSV, permission, audit |
| `analytics.resolvers.ts` | 16 read-only queries |

---

## 3. Metrics, and what each actually means

### Period vs backlog scoping

Two different scopings live side by side, and confusing them is the easiest way
to misread the page:

- **Period figures** respect the date filter: submissions received, resolved in
  period, trend, all breakdowns.
- **Backlog figures** deliberately ignore it: open count, high-priority open,
  unassigned, oldest open. *A backlog does not stop existing because somebody
  changed the date picker.* Each backlog card is labelled "All periods".

### "Open" includes RESOLVED

Phase 5 treats only `CLOSED` and `REJECTED` as terminal — a `RESOLVED`
submission can reopen. So "open" here means **the campaign has not finished with
it**, and a resolved-but-not-closed item is counted as open. This is surprising,
and it is deliberate: the Phase 5 analytics service uses the identical
definition, and two dashboards disagreeing about what "open" means would be
worse than the surprise. Asserted directly in the test suite.

### Resolved *in period* keys on `resolvedAt`

"What did we clear this month" includes submissions that arrived earlier.
Counting by submission date would exclude exactly the old backlog items a team
is proudest of closing.

### Mean **and** median

Both are always reported. A handful of items that sat for eight months drags the
mean well above anything a team recognises; the median is what they experience.
**The gap between them is itself the signal** that a few very old items are
distorting the average, so hiding either would hide that signal.

### Time to resolution vs backlog aging

Two distributions that look similar and answer opposite questions:

- **Time to resolution** — a record of the **past**. It flatters a team that
  closes easy items quickly while ignoring hard ones, because the hard ones are
  not in it.
- **Backlog aging** — a picture of the **present**. It is where those ignored
  hard items appear.

Both are shown, because either alone is misleading. A dashboard showing only the
first can look excellent while a ward's drains have waited four months.

### First response is an approximation

Phase 5 stores no explicit first-response timestamp. This uses the earliest
`IssueHistory` entry with action `STATUS_CHANGED` — the moment a staff member
first did something visible. It is labelled as an approximation in the UI, in
the schema and here. Inventing a column and backfilling it would be worse: the
backfilled values would be guesses presented as records.

### `null` is not `0`

A rate with an empty denominator, a change from a period with no submissions,
and an average with no samples are all `null`, and the UI prints an em dash.
Rendering them as "0%" would state something false with the same confidence as a
measurement. This is enforced by `rate()` and `percentageChange()` and asserted
in tests.

Area resolution **rates** are additionally withheld below
`ANALYTICS_LIMITS.minSamplesForRate` (3): a percentage computed from two
submissions is noise wearing a decimal point.

---

## 4. Comparative periods

The previous window is **equal in length**, ending exactly where the current one
begins — no gap, no overlap. Comparing a 30-day selection against "last calendar
month" would produce a change figure partly composed of a windowing artefact,
and every insight card would faithfully repeat it.

Presets: Today, Last 7, **Last 90** (added in Phase 7), Last 30, This month,
Previous month, Custom. Custom is capped at `MAX_ANALYTICS_RANGE_DAYS` (400) by
the shared Phase 4 resolver.

> The `AnalyticsRange` enum exists in two places — the TypeScript union and the
> GraphQL SDL. Adding `LAST_90_DAYS` to the first and not the second compiled
> cleanly and failed at runtime; the test suite caught it. If you add a range,
> add it to both.

---

## 5. Geographic analytics

Three levels, because exactly three columns exist on `Issue`: **ward, locality,
area**. There is deliberately no "constituency" or "zone" — a filter the
database cannot populate silently matches nothing, which is worse than not
offering it.

### There is no map, and that is a decision

- **No boundary data exists** anywhere in Phases 1–6: no polygons, no
  constituency shapes, no geocoding. A choropleth would mean sourcing boundary
  files, and every ward whose name did not match would silently vanish from the
  picture rather than appear as an unmatched row.
- **A point map would be the wrong answer.** `Issue` does hold coordinates when
  a citizen shared them, and **nothing in this module reads those columns**.
  Plotting them plots where individual people were standing — sometimes their
  doorstep. The administrative question is "where are the drainage problems",
  which the ward answers.
- A ranked table with density bars carries more decision-relevant information
  per pixel anyway: exact counts, the open/resolved split and the resolution
  rate are readable at once, and all survive a screen reader.

If boundary data is ever licensed, `AreaSections.tsx` is the component a
choropleth would replace; the query feeding it would not change.

### Attention rankings

Ranked by volume alone, the table mostly ranks population and reporting habit.
Three additional rankings surface what is going **wrong**: most unresolved, most
high-priority, slowest to resolve. The last requires a minimum sample, so one
six-month outlier in a two-submission ward cannot top the table and send
somebody to the wrong place.

Submissions with no value at the selected level are counted under **one "Not
specified" row** rather than dropped, so the table still sums to the headline.

---

## 6. AI integration

Phase 7 **consumes** Phase 6; it calls no model and extracts no topic.

**Theme counts are recomputed, never read from the stored `issueCount`.** That
stored number covers the period the theme was *detected* over, which is almost
never the dashboard's filter. Showing it would silently ignore the filter the
administrator just set — the most plausible way this dashboard could tell
somebody something false. Membership is intersected with the current scope and
counted again.

Topics are counted over **distinct submissions**, not topic rows, so "twenty
issues mention road damage" is not conflated with "twenty mentions".

The division of labour is Phase 6's rule, unchanged: **the database produces
every number; the AI produced only the words beside them.** Theme cards carry an
"AI-assisted" notice stating that counts were computed by the platform, and
model prose is visually set apart from the figures.

### Insight cards are *not* AI-written

This is a deliberate narrowing of what Phase 6 permits. Phase 6 lets a model
write prose from supplied statistics because an executive summary is a paragraph
a human reviews. **An insight card is a one-line claim with a number in it,
shown without review** — the shape most likely to be screenshotted and repeated.
So its wording is a deterministic template over backend-computed values, and
every card renders its two counts and the change beside the sentence.

Cards are suppressed below a floor (5 submissions): "up 250%, from 2 to 7" is
true and worthless.

---

## 7. QR integration

Joins Phase 4 scans to Phase 5 submissions for a channel view: scans,
submissions via QR, submission rate, and a per-campaign table. Automated
crawlers are excluded, matching the Phase 4 dashboard — counting them would
inflate the denominator and make every rate look worse than it is.

**A conversion rate is a statement about a poster, not about a person.** A scan
means a code was scanned. Nothing about who scanned it, what they think, or how
they vote is inferred or storable.

Requires `QR_ANALYTICS_READ`; returns `null` without it, so the section is
omitted rather than the page refused.

---

## 8. Filters

Date range · category · status · priority · source · area (at the selected
level) · geographic level · topic · theme · assignee · include-unmoderated.

Every filter reaches **every** metric, because all of them derive from
`buildScope`. Tested explicitly: filtering by category changes the overview
headline *and* makes the area table sum to it.

**Filters live in the URL.** There is no `useState` shadowing them — the two
would drift the moment somebody used the back button. This is a page whose
purpose is to be narrowed and then shared: "look at Ward 12's drainage backlog"
should be a link somebody can paste.

```
/admin/analytics?range=LAST_90_DAYS&category=<id>&area=Ward+12&priority=HIGH
```

Empty lists are sent as `null`, not `[]` — an empty `IN` clause would turn "no
category filter" into "no results". List lengths are capped at 100 server-side
so a client cannot turn one page load into a ten-thousand-element `IN`.

Area values are matched **exactly**: "Ward 1" must not swallow "Ward 12", which
is precisely the quiet miscount that destroys trust in a dashboard.

---

## 9. Export

CSV, six aggregate datasets: overview, categories, statuses, priorities, areas,
resolution.

**Every dataset is a table of counts and durations. There is no dataset that
exports submission rows**, and that is the central design decision rather than
an omission. An export is the one operation whose output leaves every access
control the platform has: inside the console a citizen's phone number sits
behind `ISSUE_CONTACT_READ` and reading it writes an audit record; in a CSV on a
laptop it is behind nothing. So the export offers the coarsest thing that still
answers an administrative question, and an administrator who needs a specific
submission opens it in the console where the disclosure is logged.

Absent by construction: names, phone numbers, emails, descriptions, addresses,
coordinates, attachments, staff notes, per-issue AI summaries, and reference
numbers. Asserted across all datasets in the test suite.

Cells are escaped with a **formula-injection guard** carried over from the Phase
4 export — a ward name beginning with `=`, `+`, `-` or `@` executes as a formula
when opened in Excel or Sheets, and area names are tenant-controlled text.

Export requires `ANALYTICS_EXPORT` in addition to read access, and is audited
**on request and on completion** — an audit written only on success would be
silent about exactly the attempts worth reviewing.

---

## 10. Security

### RBAC

Reading reuses Phase 5's `ISSUE_ANALYTICS_READ` rather than inventing
`ANALYTICS_READ`: it is the same disclosure, and a second permission over the
same data means two grants to keep in step, with somebody eventually holding one
and not the other for no articulable reason.

| Role | Read dashboard | Export | QR section | AI section |
| --- | --- | --- | --- | --- |
| `CAMPAIGN_ADMIN` | ✓ | ✓ | ✓ | ✓ |
| `ANALYST` | ✓ | ✓ | ✓ | ✓ |
| `ISSUE_MANAGER` | ✓ | — | — | ✓ |
| `CANDIDATE` | ✓ | — | ✓ | ✓ |
| `CONTENT_MANAGER`, `FIELD_COORDINATOR`, `VIEWER` | — | — | — | — |

`ANALYTICS_EXPORT` is the one new permission in the phase, granted to
`CAMPAIGN_ADMIN` and `ANALYST` only.

### Tenant isolation

`organizationId` is derived from the verified session and written into every
scope. A forged tenant header changes nothing. Tested in both directions across
overview, areas, themes and export.

### Privacy

- **No coordinates are read** by any code path in the phase.
- The **backlog table** is the only place individual submissions appear, because
  it is a worklist someone must open. It carries reference, title, category,
  area, priority, status, age and assignee — no contact details, no description.
- **Area detail** recent-issue lists carry the same narrow field set.
- No metric, field or table in the phase can hold a score, likelihood or
  prediction about a person.

---

## 11. Performance

- Every count is a `count` or `groupBy` in the database.
- Two indexes added, both earned by a query the dashboard issues on every load:
  `(organizationId, resolvedAt)` for all resolution metrics, and
  `(organizationId, status, submittedAt)` for filtered aggregates. Deliberately
  **not** one index per filterable column — `categoryId`, `priority` and `ward`
  already have tenant-scoped indexes from Phase 5.
- Six independent queries per page load rather than one document, so the header
  paints while the slower area rollup runs.
- Three places select scalar columns and process in Node, each bounded by the
  capped date window: trend bucketing, resolution durations, per-area durations.
  See §13.

### No caching

Analytics are computed per request and the page says so ("Figures computed
<time>. Not cached."). Caching was considered and rejected for this phase: a
cache key would have to include the tenant, the full filter set and the range,
which is close to a unique key per view, and a stale figure on a decision
dashboard is worse than a slow one. The freshness line exists so that if caching
is ever added, the UI already has somewhere honest to say so.

---

## 12. GraphQL

**16 queries, no mutations** — Phase 7 only reads.

`analyticsOverview` · `analyticsTrend` · `analyticsByCategory` ·
`analyticsByStatus` · `analyticsByPriority` · `analyticsAreas` ·
`analyticsAreaAttention` · `analyticsAreaDetail` · `analyticsAreaOptions` ·
`analyticsResolution` · `analyticsBacklog` · `analyticsThemes` ·
`analyticsTopics` · `analyticsSource` · `analyticsInsights` ·
`analyticsExportCsv`

`AnalyticsFilterInput` has **no `organizationId` field**, so a client cannot ask
about another tenant even syntactically.

`analyticsThemes`, `analyticsTopics` and `analyticsSource` are nullable and
return `null` when the caller lacks the relevant permission — the section is
omitted, not the page refused. A dashboard that fails entirely because one of
six panels is not permitted is worse than one that shows five, and `null`
carries no data.

---

## 13. Known limitations

1. **Trend bucketing happens in Node**, not via SQL `date_trunc`. Grouping by an
   expression is not expressible through Prisma's `groupBy`, so the alternative
   is `$queryRaw` with a hand-built `WHERE` — a second implementation of the
   filter logic that must stay in step with `buildScope` and would be the
   module's only injection surface. The query selects one timestamp column and
   is bounded by the capped window. This should become a raw query when a
   tenant's capped window regularly exceeds a few hundred thousand submissions.
   The same applies to resolution durations and per-area durations.
2. **No caching** (§11). Every load recomputes.
3. **No map.** Ranked table and density bars only (§5).
4. **First response is approximated** from the first status change (§3).
5. **Median is computed in Node** from the same bounded selection as the mean.
6. **Area values are free text.** "Ward 1", "ward 1" and "Ward-1" are three
   distinct areas, because Phase 5 stores whatever the citizen typed. There is
   no normalisation or canonical ward list — adding one is a Phase 5 data-model
   change, not an analytics change.
7. **Attention rankings re-fetch the area table** (`areas()` at limit 100) and
   sort in memory rather than issuing four ranked queries. Simpler and correct;
   it would need revisiting for a tenant with hundreds of areas.
8. **Insight cards are template-generated**, so their wording is fixed. They are
   deliberately not model-written (§6).
9. **The export is capped** at `ANALYTICS_LIMITS.exportMaxRows` for the area
   dataset. Other datasets are naturally bounded by their dimension.
10. **No PDF export.** CSV only, matching the Phase 4 precedent.

---

## 14. Testing

44 tests in `apps/api/src/__tests__/analytics.test.ts`, against a **fixture with
hand-computed expectations** so assertions check arithmetic a reader can verify
rather than whatever the code produced.

Covered: pure calculations and bucket boundaries; overview against known
figures; equal-length period comparison; empty results returning `null` not `0`;
category/status/priority aggregation; single and combined filters; exact area
matching; filter-list caps; dense trend series and granularity widening; area
ranking, sum-to-total and withheld small-sample rates; resolution and aging
distributions; backlog contents; theme recomputation inside the filter;
permission-gated section omission; insight evidence and floor suppression; RBAC
per role; tenant isolation across overview, areas, themes and export; export
filter-respect, PII absence, audit and formula escaping.

---

## 15. What Phase 7 provides for Phase 8

- A filter/scope layer any future metric can reuse without re-deriving tenancy.
- A chart primitive set (`components/analytics/charts.tsx`) now shared by the QR,
  issue and decision dashboards.
- An aggregate export path with its permission and audit already in place.
- Area rollups and attention rankings, which are the natural input to the
  mapping work if boundary data is ever licensed.

Phase 8+ functionality is **not** implemented, and none of the political
profiling, voter prediction, supporter classification or social-media capability
excluded from Phases 5–6 is a permitted extension of any of the above.
