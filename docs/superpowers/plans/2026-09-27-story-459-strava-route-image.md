# Strava Route Map Image (#459) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Strava's own static route map (the public route page's `og:image`) at import and display it as one consistent, whole-route image on the run-facing surfaces, falling back to today's "Map ↗" link for MapMyRun / unsupported / imageless routes.

**Architecture:** Extends the exact provider→enrich→forms→db→display seam #457 built for distance/elevation/geometry. The Strava provider gains a second, best-effort fetch of the public route page to scrape `og:image`; that URL rides through `/api/route/enrich`, the create/edit forms, and `workout_families.map_image_url`, and renders in `WorkoutDetails` (the single component all four route surfaces share). MapMyRun and every other provider set no image and keep the link.

**Tech Stack:** Next.js (App Router) Server Actions + Route Handlers, TypeScript, Neon Postgres via `@neondatabase/serverless` (`sql` tagged template in `lib/db.ts`), Zod input schema, Vitest (node env — no jsdom/testing-library, so no component render tests).

**Spec:** GitHub issue [#459](https://github.com/foulox/tigerwolves/issues/459) (Design / Acceptance criteria / Constraints). Clickable mockup + real sample images: `scratch/mockups/459/` (gitignored — copy into the branch at build start so the visual travels; see Global Constraints).

## Global Constraints

- **Strava `og:image` is fetched with GET** (HEAD returns 405) and a browser-like `User-Agent`; the URL is unsigned/stable (`https://d3o5xota0a1fcr.cloudfront.net/v6/maps/<token>`, no `Expires`/`Signature`). Store the URL as-is.
- **The og:image fetch is best-effort and must never fail the enrichment**: any non-200, throw, or missing tag → `imageUrl` omitted, but distance/elevation/geometry still return.
- **Only accept absolute `http(s)` og:image URLs** — reject relative/protocol-relative values so a broken `<img>` never renders.
- **New DB column is nullable and additive**: `map_image_url TEXT`. Add it to BOTH `scripts/migrate-459.sql` (ALTER, for existing DBs) AND the `CREATE TABLE IF NOT EXISTS workout_families (...)` block in `scripts/migrate.sql` (for fresh DBs and to satisfy `__tests__/schemaSemantics.test.ts`, which reads columns from `migrate.sql`). Every migration stays idempotent/replay-safe (`ADD COLUMN IF NOT EXISTS`).
- **The new field is required (`string | null`), not optional**, on `WorkoutVariantRow` (`lib/data.ts`) and `WorkoutVariantInput` (`lib/workoutVariant.ts`) — mirroring how #457 typed `distanceMiles`. This makes `tsc` enumerate every fixture that must gain `mapImageUrl: null`; let the compiler drive that list.
- **No component render harness** (vitest `environment: 'node'`). Display changes (`WorkoutDetails.tsx`, forms) are verified by `npx tsc --noEmit` + the Preview URL, exactly as #457 did. Do not add jsdom/testing-library.
- **Plain `<img>`, not `next/image`** for the map (external asset, avoids a remote-domain allowlist).
- **Migration reaches four Neon branches over the story's life**: Preview + test-data during the build (Task 4); production + demo-data at merge (see Migration Rollout at the end). CI runs unit tests against the **test-data** branch, so an un-applied migration turns CI red with `column … does not exist`.
- **Commit the mockup:** at build start, `git add -f scratch/mockups/459/` is NOT the move (scratch is gitignored by design); instead copy `scratch/mockups/459/` into `docs/superpowers/plans/assets/459/` and commit it so it travels. (One-time, Task 0.)

## Review Focus

- **Private / deleted Strava route** — public page returns non-200 or has no `og:image`: `imageUrl` omitted, distance/elevation still returned, UI shows the link, no error. (Task 2)
- **Reversed meta-attribute order** — `<meta content="…" property="og:image">`: `parseOgImage` still extracts the URL. (Task 1)
- **Non-absolute og:image value** — a relative or protocol-relative `content`: rejected (returns null) so no broken `<img>` renders. (Task 1)
- **Route link removed after a prior enrich** — stale `mapImageUrl` is cleared on submit so a linkless route can't persist a map from a prior fetch. (Task 6)
- **og:image page fetch throws/times out** — provider still returns distance/elevation/geometry; `imageUrl` omitted. (Task 2)

---

### Task 0: Isolated worktree + carry the mockup into the repo

**Files:**
- Create: `docs/superpowers/plans/assets/459/` (copied from `scratch/mockups/459/`)

- [ ] **Step 1: Create an isolated worktree for the story branch (REQUIRED — never build in the primary checkout)**

Per the umbrella CLAUDE.md CONSUME rule, use `superpowers:using-git-worktrees` to create an isolated worktree for branch `459-strava-route-image` off `origin/main`, and **park the primary checkout on a guard branch** as a backstop (spawned subagents pin their shell to the primary checkout and will otherwise commit to `main`). All subsequent steps and every subagent's `Bash` calls run **inside the worktree** — hard-`cd` into it if a subagent's shell defaults elsewhere.

```bash
git fetch origin main
# In the PRIMARY checkout, park it off main so stray subagent commits can't land on main:
git -C /Users/lou.fox/claude-foulox/tigerwolves switch -c guard/459 origin/main 2>/dev/null || true
```

Then create the worktree via the skill (which handles native worktree tooling / fallback) for `459-strava-route-image`.

- [ ] **Step 2: Commit the plan (first commit on the branch, inside the worktree)**

```bash
git add docs/superpowers/plans/2026-09-27-story-459-strava-route-image.md
git commit -m "plan(#459): Strava route map image — TDD implementation plan"
```

- [ ] **Step 3: Carry the mockup so the visual travels**

```bash
mkdir -p docs/superpowers/plans/assets/459
cp scratch/mockups/459/index.html scratch/mockups/459/strava-map.png scratch/mockups/459/mmr-thumb.png docs/superpowers/plans/assets/459/
git add docs/superpowers/plans/assets/459
git commit -m "docs(#459): commit route-image mockup + sample images"
```

---

### Task 1: `parseOgImage` helper + `RouteEnrichment.imageUrl`

**Files:**
- Modify: `lib/routeProviders/types.ts`
- Modify: `lib/routeProviders/strava.ts` (add exported `parseOgImage`)
- Test: `__tests__/routeProviderStrava.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseOgImage(html: string): string | null` (exported from `lib/routeProviders/strava.ts`); `RouteEnrichment.imageUrl?: string`.

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/routeProviderStrava.test.ts`:

```ts
import { parseOgImage } from '@/lib/routeProviders/strava'

describe('parseOgImage', () => {
  it('extracts an absolute og:image URL (property before content)', () => {
    const html = `<meta property="og:image" content="https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC">`
    expect(parseOgImage(html)).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC')
  })
  it('extracts when content comes before property (reversed attr order)', () => {
    const html = `<meta content="https://d3o5xota0a1fcr.cloudfront.net/v6/maps/XYZ" property="og:image">`
    expect(parseOgImage(html)).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/XYZ')
  })
  it('returns null when there is no og:image tag', () => {
    expect(parseOgImage('<meta property="og:title" content="Doves loop">')).toBeNull()
  })
  it('rejects a non-absolute (protocol-relative) og:image value', () => {
    const html = `<meta property="og:image" content="//drzetlglcbfx.cloudfront.net/thumb/1?size=200x200">`
    expect(parseOgImage(html)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/routeProviderStrava.test.ts -t parseOgImage`
Expected: FAIL — `parseOgImage` is not exported.

- [ ] **Step 3: Add the optional field to the type**

In `lib/routeProviders/types.ts`, add to `RouteEnrichment`:

```ts
export type RouteEnrichment = {
  distanceMiles: number
  elevationFeet: number
  geometry: unknown
  name?: string
  imageUrl?: string            // #459: provider's own static map image (Strava og:image); omitted when none
}
```

- [ ] **Step 4: Implement `parseOgImage`**

In `lib/routeProviders/strava.ts`, add (exported, near the top-level helpers):

```ts
// #459: pull the og:image URL out of a route page's HTML, tolerant of attribute
// order, accepting only absolute http(s) URLs (a relative value would render broken).
export function parseOgImage(html: string): string | null {
  const metas = html.match(/<meta[^>]*>/gi) ?? []
  for (const tag of metas) {
    if (!/property=["']og:image["']/i.test(tag)) continue
    const m = tag.match(/content=["']([^"']+)["']/i)
    if (m && /^https?:\/\//i.test(m[1])) return m[1]
  }
  return null
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run __tests__/routeProviderStrava.test.ts -t parseOgImage`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/routeProviders/types.ts lib/routeProviders/strava.ts __tests__/routeProviderStrava.test.ts
git commit -m "feat(#459): parseOgImage helper + RouteEnrichment.imageUrl"
```

---

### Task 2: Strava provider captures og:image via a best-effort page fetch

**Files:**
- Modify: `lib/routeProviders/strava.ts`
- Test: `__tests__/routeProviderStrava.test.ts`

**Interfaces:**
- Consumes: `parseOgImage` (Task 1), `RouteEnrichment.imageUrl` (Task 1).
- Produces: `stravaProvider.fetch(url)` now resolves with `imageUrl` set to the og:image string when the public page yields one; `imageUrl` omitted on any page-fetch failure or missing tag. Distance/elevation/geometry unchanged.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('stravaProvider.fetch', …)` block in `__tests__/routeProviderStrava.test.ts`. The provider now calls `fetch` twice — first the API (JSON), then the public page (text) — so mock them in order:

```ts
it('sets imageUrl from the public page og:image (second fetch)', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      name: 'Doves loop', distance: 16093.44, elevation_gain: 100,
      map: { summary_polyline: 'abc' },
    }) })
    .mockResolvedValueOnce({ ok: true, text: async () =>
      `<meta property="og:image" content="https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC">` })
  vi.stubGlobal('fetch', fetchMock)
  const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
  expect(r!.imageUrl).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC')
  expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
})

it('omits imageUrl (but still returns metrics) when the page fetch is not ok', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      distance: 16093.44, elevation_gain: 100, map: { summary_polyline: 'abc' },
    }) })
    .mockResolvedValueOnce({ ok: false })
  vi.stubGlobal('fetch', fetchMock)
  const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
  expect(r!.imageUrl).toBeUndefined()
  expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
})

it('omits imageUrl when the page fetch throws', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({
      distance: 16093.44, elevation_gain: 100, map: { summary_polyline: 'abc' },
    }) })
    .mockRejectedValueOnce(new Error('network'))
  vi.stubGlobal('fetch', fetchMock)
  const r = await stravaProvider.fetch('https://www.strava.com/routes/6647021')
  expect(r!.imageUrl).toBeUndefined()
  expect(r!.distanceMiles).toBeCloseTo(10.0, 2)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/routeProviderStrava.test.ts -t imageUrl`
Expected: FAIL — `imageUrl` is undefined in the success case (provider doesn't fetch the page yet).

- [ ] **Step 3: Implement the page fetch + wire imageUrl**

In `lib/routeProviders/strava.ts`, add a browser UA constant and a best-effort helper, and set `imageUrl` in `fetch()`:

```ts
// #459: browser-like UA so Strava serves the full public route page (og:image present).
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// #459: best-effort — any failure yields null so enrichment (distance/elevation) survives.
async function fetchStravaOgImage(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.strava.com/routes/${id}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    return parseOgImage(await res.text())
  } catch {
    return null
  }
}
```

Then, inside `stravaProvider.fetch`, after the existing `return {` object is built from the API response, capture the image first and include it. Replace the current `return { … }` with:

```ts
      const imageUrl = await fetchStravaOgImage(id)
      return {
        distanceMiles: distance / METERS_PER_MILE,
        elevationFeet: elevation * FEET_PER_METER,
        geometry: data.map?.summary_polyline ? { summaryPolyline: data.map.summary_polyline } : null,
        name: data.name,
        imageUrl: imageUrl ?? undefined,
      }
```

- [ ] **Step 4: Run the full provider suite**

Run: `npx vitest run __tests__/routeProviderStrava.test.ts`
Expected: PASS (existing tests + the 3 new ones). Existing single-`mockResolvedValue` tests still pass because that mock answers both the API and page calls (the page's `.text` is undefined → `fetchStravaOgImage` catches and returns null → `imageUrl` omitted).

- [ ] **Step 5: Commit**

```bash
git add lib/routeProviders/strava.ts __tests__/routeProviderStrava.test.ts
git commit -m "feat(#459): Strava provider scrapes og:image (best-effort) into imageUrl"
```

---

### Task 3: `/api/route/enrich` returns `imageUrl`

**Files:**
- Modify: `app/api/route/enrich/route.ts`
- Test: `__tests__/routeEnrich.test.ts`

**Interfaces:**
- Consumes: `RouteEnrichment.imageUrl` from the provider (Task 2).
- Produces: the enrich JSON response now includes `imageUrl` (string or omitted).

- [ ] **Step 1: Write the failing test**

In `__tests__/routeEnrich.test.ts`, extend the success-path test (the one that mocks `providerFor` returning a fetch result) so the mocked enrichment includes `imageUrl` and assert it round-trips. Add `imageUrl: 'https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC'` to the mocked `fetch` resolution, then:

```ts
  const json = await res.json()
  expect(json.imageUrl).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC')
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/routeEnrich.test.ts`
Expected: FAIL — response has no `imageUrl` key.

- [ ] **Step 3: Add imageUrl to the response**

In `app/api/route/enrich/route.ts`, add one line to the `NextResponse.json({ … })` success payload:

```ts
    return NextResponse.json({
      enriched: true,
      provider: provider.id,
      distanceMiles: result.distanceMiles,
      elevationFeet: result.elevationFeet,
      geometry: result.geometry,
      name: result.name,
      imageUrl: result.imageUrl,
    })
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/routeEnrich.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/route/enrich/route.ts __tests__/routeEnrich.test.ts
git commit -m "feat(#459): /api/route/enrich returns imageUrl"
```

---

### Task 4: Migration — `map_image_url` column + schema-semantics + apply to Preview & test-data

**Files:**
- Create: `scripts/migrate-459.sql`
- Modify: `scripts/migrate.sql` (the `CREATE TABLE IF NOT EXISTS workout_families (...)` block)
- Modify: `lib/schema-semantics.yml`
- Test: `__tests__/schemaSemantics.test.ts` (already exists — must stay green)

**Interfaces:**
- Produces: `workout_families.map_image_url TEXT` in every DB the migration set is applied to.

- [ ] **Step 1: Write the migration**

Create `scripts/migrate-459.sql`:

```sql
-- scripts/migrate-459.sql
-- #459: Strava's own static route map image URL (public route page og:image).
-- Additive + nullable + replay-safe (ADD COLUMN IF NOT EXISTS). NULL when the
-- route has no link, isn't Strava, or the page yielded no og:image.
ALTER TABLE workout_families ADD COLUMN IF NOT EXISTS map_image_url TEXT;
```

- [ ] **Step 2: Add the column to the base CREATE TABLE**

In `scripts/migrate.sql`, add `map_image_url TEXT,` to the `CREATE TABLE IF NOT EXISTS workout_families (...)` block, next to `geometry` (so fresh DBs get it and `schemaSemantics.test.ts` — which parses columns from this file — sees it):

```sql
  geometry            JSONB,            -- #457: provider-native route geometry (Strava: { summaryPolyline })
  map_image_url       TEXT,             -- #459: Strava public-page og:image (static route map)
```

- [ ] **Step 3: Document it in schema-semantics**

In `lib/schema-semantics.yml`, under `workout_families.fields`, after the `geometry:` entry:

```yaml
    map_image_url:
      description: >
        URL of the route's own static map image (Strava's public-page og:image).
        Displayed as a whole-route preview on the run surfaces. NULL when the route
        has no link, isn't Strava, or the page yielded no og:image.
```

- [ ] **Step 4: Run the schema-semantics test**

Run: `npx vitest run __tests__/schemaSemantics.test.ts`
Expected: PASS — `workout_families` has no undocumented columns. (If it fails naming `map_image_url` undocumented, Step 3's indentation is off.)

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-459.sql scripts/migrate.sql lib/schema-semantics.yml
git commit -m "feat(#459): migration + schema-semantics for map_image_url"
```

- [ ] **Step 6: Apply to the Preview Neon branch**

This PR's Preview branch is `preview/459-strava-route-image`. Fetch its connection string via the Neon REST API (token in `.env.local`'s `NEON_API_KEY`; project `purple-star-02119717`), then apply. If a live DB action is genuinely blocked (no approval prompt appears), ask Lou to step out of Auto Mode for this one action — but attempt it first.

```bash
DATABASE_URL="<preview-branch-connection-uri>" npx tsx scripts/run-migrate.ts
```

- [ ] **Step 7: Apply to the test-data branch (CI runs unit tests here)**

```bash
DATABASE_URL="<test-data-branch-connection-uri>" npx tsx scripts/run-migrate.ts
```

- [ ] **Step 8: Verify the column exists on both**

For each branch's `DATABASE_URL`, confirm the column is really there before moving on:

```bash
DATABASE_URL="<branch-uri>" npx tsx -e "import {neon} from '@neondatabase/serverless'; const sql=neon(process.env.DATABASE_URL); sql\`SELECT column_name FROM information_schema.columns WHERE table_name='workout_families' AND column_name='map_image_url'\`.then(r=>{console.log(r); process.exit(r.length?0:1)})"
```

Expected: one row `{ column_name: 'map_image_url' }`. (Production + demo-data are applied at merge — see Migration Rollout.)

---

### Task 5: Persist + read `map_image_url` (types + db)

**Files:**
- Modify: `lib/data.ts` (`WorkoutVariantRow`)
- Modify: `lib/workoutVariant.ts` (`WorkoutVariantInputSchema` + `buildWorkoutVariantInput`)
- Modify: `lib/db.ts` (two SELECTs, row mapping, INSERT, UPDATE)
- Test: `__tests__/db.test.ts`, `__tests__/workoutVariantInput.test.ts`
- Modify (fixtures, tsc-driven): every file the compiler flags — see Step 7.

**Interfaces:**
- Consumes: `map_image_url` column (Task 4).
- Produces: `WorkoutVariantRow.mapImageUrl: string | null`; `WorkoutVariantInput.mapImageUrl: string | null`; `dbInsertWorkoutVariant`/`dbUpdateWorkoutVariant` persist it; `fetchWorkoutVariants` reads it back.

- [ ] **Step 1: Write the failing tests**

In `__tests__/workoutVariantInput.test.ts`, extend the mapping test so the built input carries `mapImageUrl`:

```ts
it('maps mapImageUrl from form data (null when blank)', () => {
  const withUrl = buildWorkoutVariantInput(fd({ ...base, mapImageUrl: 'https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC' }))
  expect(withUrl.mapImageUrl).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC')
  const blank = buildWorkoutVariantInput(fd({ ...base }))
  expect(blank.mapImageUrl).toBeNull()
})
```

In `__tests__/db.test.ts`, in the existing insert→read round-trip test that already sets `distanceMiles`/`geometry` (near line 559), add `mapImageUrl` to the insert input and assert the read-back:

```ts
// insert input:
mapImageUrl: 'https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC',
// after fetchWorkoutVariants:
expect(row.mapImageUrl).toBe('https://d3o5xota0a1fcr.cloudfront.net/v6/maps/ABC')
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run __tests__/workoutVariantInput.test.ts __tests__/db.test.ts -t mapImageUrl`
Expected: FAIL (and/or tsc errors on the unknown property) — the field doesn't exist yet.

- [ ] **Step 3: Add the field to the row + input types**

In `lib/data.ts`, add to `WorkoutVariantRow` (next to `geometry`):

```ts
  mapImageUrl: string | null
```

In `lib/workoutVariant.ts`, add to `WorkoutVariantInputSchema` (next to `geometry`):

```ts
  mapImageUrl: z.string().nullable(),
```

and to `buildWorkoutVariantInput`'s returned object:

```ts
    mapImageUrl: (formData.get('mapImageUrl') as string) || null,
```

- [ ] **Step 4: Wire db.ts read**

In `lib/db.ts`, add `wf.map_image_url` to BOTH SELECT column lists (next to `wf.distance_miles, wf.elevation_gain_feet, wf.geometry,`), and add to the row-mapping object (next to `geometry:`):

```ts
    mapImageUrl: (r.map_image_url as string | null) ?? null,
```

- [ ] **Step 5: Wire db.ts write**

In `dbInsertWorkoutVariant`, add `map_image_url` to the INSERT column list and `${w.mapImageUrl}` to VALUES (plain TEXT — no `::jsonb` cast). In `dbUpdateWorkoutVariant`, add to the `SET` list:

```ts
      map_image_url = ${w.mapImageUrl}
```

(place it after `geometry = …`).

- [ ] **Step 6: Run the targeted tests**

Run: `npx vitest run __tests__/workoutVariantInput.test.ts __tests__/db.test.ts -t mapImageUrl`
Expected: PASS.

- [ ] **Step 7: Fix every fixture tsc now flags**

Run: `npx tsc --noEmit`
Expected: errors listing each object literal missing `mapImageUrl`. Add `mapImageUrl: null` to each. Known sites (confirm against tsc output — this is the authoritative list):
`__tests__/postBuilder.test.ts`, `__tests__/myPlan.test.ts`, `__tests__/mourningDoves.test.ts`, `__tests__/recency.test.ts`, `__tests__/workoutVariant.test.ts`, `__tests__/scheduleCard.test.ts`, `__tests__/libraryPicker.test.ts`, `__tests__/schedulePicker.test.ts`, `__tests__/db.test.ts` (rows at ~205/291/616). For `WorkoutVariantInput` fixtures that use the FormData-style string shape (`__tests__/workoutSaveActions.test.ts` line ~48), add `mapImageUrl: ''` alongside `geometry: ''` — that is Task 6's fixture; if tsc flags it now, add it now.

Re-run `npx tsc --noEmit` until clean.

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run`
Expected: PASS (db.test.ts integration tests require the test-data migration from Task 4 to be applied).

- [ ] **Step 9: Commit**

```bash
git add lib/data.ts lib/workoutVariant.ts lib/db.ts __tests__
git commit -m "feat(#459): persist + read map_image_url on workout_families"
```

---

### Task 6: Create/edit forms carry `imageUrl`

**Files:**
- Modify: `components/AddWorkoutForm.tsx`
- Modify: `components/EditWorkoutForm.tsx`
- Test: `__tests__/workoutSaveActions.test.ts` (fixture only)

**Interfaces:**
- Consumes: enrich response `imageUrl` (Task 3); `WorkoutVariantInput.mapImageUrl` (Task 5); `WorkoutVariantRow.mapImageUrl` (Task 5, for Edit's initial state).
- Produces: both forms set `formData['mapImageUrl']` so the Server Action persists it. No visible input — the URL isn't user-editable (unlike distance/elevation).

- [ ] **Step 1: AddWorkoutForm — state + enrich + clear + submit**

In `components/AddWorkoutForm.tsx`, mirror the existing `geometry` handling exactly:

- Add state: `const [mapImageUrl, setMapImageUrl] = useState<string | null>(null)`
- In the enrich `.then(data => { if (data?.enriched) { … } })` block, add: `setMapImageUrl(data.imageUrl ?? null)`
- In the route-cleared branch (where `setGeometry(null)` runs), add: `setMapImageUrl(null)`
- In `buildFormData`, next to the `geometry` line, add: `formData.set('mapImageUrl', mapImageUrl ?? '')`

- [ ] **Step 2: EditWorkoutForm — same, seeded from the variant**

In `components/EditWorkoutForm.tsx`, mirror the same four edits, but seed initial state from the existing row:

- `const [mapImageUrl, setMapImageUrl] = useState<string | null>(variant.mapImageUrl ?? null)`
- enrich `.then`: `setMapImageUrl(data.imageUrl ?? null)`
- route-cleared branch: `setMapImageUrl(null)`
- `buildFormData`: `formData.set('mapImageUrl', mapImageUrl ?? '')`

- [ ] **Step 3: Update the save-action fixture**

In `__tests__/workoutSaveActions.test.ts`, add `mapImageUrl: ''` to the FormData-shaped base fixture (line ~48, alongside `geometry: ''`) if not already added in Task 5 Step 7.

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS. (Form behavior itself has no render test — verified on Preview in Task 7's manual step.)

- [ ] **Step 5: Commit**

```bash
git add components/AddWorkoutForm.tsx components/EditWorkoutForm.tsx __tests__/workoutSaveActions.test.ts
git commit -m "feat(#459): forms carry route imageUrl through save"
```

---

### Task 7: Display the whole-route image in `WorkoutDetails`

**Files:**
- Modify: `components/WorkoutDetails.tsx`
- Test: none (node-only harness) — verified by tsc + Preview.

**Interfaces:**
- Consumes: `WorkoutVariantRow.mapImageUrl` (Task 5), existing `w.mapLink`, existing `showMap` (the `mapLink` exclude gates the image too, keeping Library route-free).
- Produces: the map image render.

- [ ] **Step 1: Add the image to `hasContent`**

In `components/WorkoutDetails.tsx`, add to the `hasContent` OR-chain (gated by `showMap` so Library, which excludes `mapLink`, also hides the image):

```ts
    (showMap && w.mapImageUrl) ||
```

- [ ] **Step 2: Render the image (whole route, linked, lazy)**

Immediately **before** the existing `{showMap && w.mapLink && ( … Map ↗ … )}` block, add:

```tsx
      {showMap && w.mapImageUrl && (
        <a
          href={w.mapLink ?? w.mapImageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block touch-manipulation"
        >
          <img
            src={w.mapImageUrl}
            alt="Route map"
            loading="lazy"
            className="w-full max-h-56 object-contain rounded-lg border border-gray-200 bg-gray-50"
          />
        </a>
      )}
```

The existing "Map ↗" text link stays (unchanged) as the textual affordance and the fallback when there's no image.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (all row fixtures gained `mapImageUrl` in Task 5).

- [ ] **Step 4: Full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/WorkoutDetails.tsx
git commit -m "feat(#459): render whole-route map image in WorkoutDetails"
```

- [ ] **Step 6: Open the PR and verify on Preview**

```bash
git push -u origin 459-strava-route-image
gh pr create --repo foulox/tigerwolves --title "#459: Strava route map image" --body-file <pr-body>
```

PR body carries: **Test plan (Claude)** — tsc, `vitest run`, provider/enrich/db tests, migration applied+verified on Preview & test-data (check these off immediately); **Manual steps (Lou)** — on the Preview URL, sign in as a leader, create/edit a run with a Strava route link and confirm: the whole-route image renders on Schedule / My Plan / Run page (not cropped), tapping it opens Strava, Library shows no image, a MapMyRun link shows the "Map ↗" link only, and a route with no link shows neither; plus the full AC list from #459.

Because this PR touches more than one file, end the "ready" message to Lou with: *"This PR touches many files. Run `/review` before merging."*

---

## Migration Rollout (at merge — not a build task)

`migrate-459.sql` must reach all four Neon branches. Preview + test-data are done in Task 4. At merge:
- **Production** (`br-square-river-atjn0mzq`, host `ep-super-waterfall`): apply so the live app doesn't error on the new SELECT column. `DATABASE_URL=<prod-uri> npx tsx scripts/run-migrate.ts` (guard on the `super-waterfall` host, not the branch-id slug).
- **demo-data** (`br-little-rice-at9l08ja`, host `ep-ancient-math`): `sync-demo-schema.yml` replays the full migration set on push to `main`, so a plain merge applies it automatically (additive/idempotent — no `refresh-demo.ts` needed). The PR will be auto-flagged `data-model-change`; confirm the auto-apply path is fine (it is — additive column).

## Self-Review

- **Spec coverage:** og:image capture → Tasks 1–2; enrich passthrough → Task 3; column/migration/4-branch → Task 4 + Rollout; persist/read → Task 5; forms carry it → Task 6; whole-route `object-contain` display on Schedule/My Plan/Run page + Library-excluded + link fallback → Task 7; MapMyRun link-only → inherent (provider sets no imageUrl); Heylo unchanged → untouched. All AC lines map to a task.
- **Placeholder scan:** none — every step has concrete code or an exact command.
- **Type consistency:** `imageUrl?: string` (provider/enrich, undefined-when-absent) vs `mapImageUrl: string | null` (row/input/db, null-when-absent). The boundary is deliberate: enrich JSON omits undefined; the form maps missing/blank → `null`; db stores/reads `null`. `parseOgImage` returns `string | null`; `fetchStravaOgImage` returns `string | null`; provider coerces `null → undefined` for `imageUrl`.
- **Review Focus:** all five lines have owning tests (Tasks 1–2) or are exercised by the clear-on-remove wiring (Task 6) and verified on Preview (Task 7). The empty area is display-only, which the harness can't render-test — hence the explicit Preview manual step.
