# NBR v2 Story 3 — Hero mastheads + photography — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NBR's signature full-bleed B&W photographic mastheads to the three hero screens (My Plan, All Runs, Run Detail), replacing the compact dark `Header` there, without dropping any control the `Header` carried.

**Architecture:** A new presentational `Masthead` server component renders photo + warm scrim + Jost title block, plus `brandStart`/`brandEnd` overlay slots for the brand row. The `Header`'s interactive control cluster (Clerk `UserButton` leader menu, sign-in link, `FeedbackButton`) is extracted verbatim into a shared client component `HeaderControls`, which both `Header` (utility screens) and each hero masthead render — so the behavioral contract is literally the same component in both places and the existing characterization spec proves it. Utility screens (Library, Races, Schedule, config) keep the compact `Header` — the deliberate hero-vs-browse rhythm.

**Tech Stack:** Next.js (App Router, RSC), React, Tailwind v4 tokens (`app/globals.css`), Clerk, Vitest (node env), Playwright e2e.

**Spec:** `docs/superpowers/plans/2026-10-11-nbr-redesign-spec.md` (epic #510) + issue #513. Visual target: `docs/superpowers/plans/2026-10-11-nbr-prototype.html` (`.k-mast` and the My Plan / All Runs / Run Detail `<section>`s).

## Global Constraints

- **New component gets normal TDD; purely-visual attributes are Preview-checked, never asserted as Tailwind classes** (epic #510 Testing rule). Unit tests assert *content/structure/behavior* (text rendered, element present, aria, href) — never colors/fonts/corners.
- **No functional regression.** Every control the `Header` exposed on a hero screen (leader `UserButton` menu → Run Settings `/run-config`, Edit Workouts `/admin`; signed-out sign-in link; `FeedbackButton`) must remain present and working on that screen after the masthead replaces the header. [header.spec.ts](../../../e2e/header.spec.ts) is the teeth.
- **Hero controls go over the photo** (Lou's decision, 2026-10-11): the account/leader/feedback controls render in the masthead `brandEnd` slot, restyled only by the scrim behind them — `HeaderControls` markup stays identical across contexts.
- **Masthead root element is `<header>`**, title in `<h1>`, subtitle in `<p>` — [per-run.spec.ts](../../../e2e/per-run.spec.ts) selects `header h1` / `header p`.
- **Reuse the existing white logo** `public/nbr-logo.png` (already white, used by `Header`) — no new logo asset.
- **Tokens verbatim:** warm scrim `linear-gradient(180deg, rgba(32,26,22,0.6) 0%, rgba(32,26,22,0.12) 42%, rgba(32,26,22,0.86) 100%)`; title `font-display` (Jost) 400; kicker `font-display` 500 uppercase `tracking-[0.2em]`; subtitle `font-sans` (Mulish) 300; white underline `46px × 2px`.
- **Mobile-first, free hosting:** hero photos must be downscaled/compressed before committing (target ≤ ~200 KB each) — do not commit the multi-MB originals.
- `npm run test:unit` + `npx tsc --noEmit` green locally; e2e green in CI; Preview is the visual check (Lou tests via CI + Preview, never local dev).

## Review Focus

- **Logged-out visitor on a hero screen** (All Runs, Run Detail) — masthead `brandEnd` must show the sign-in link, not a `UserButton`; `FeedbackButton` still present. → pinned in Task 6 (rewritten all-runs AC10) + Task 2 (characterization already covers logged-out via all-runs).
- **Signed-in non-leader** — `UserButton` present but with NO leader links (Run Settings / Edit Workouts hidden). `HeaderControls` keeps the `isLeader` gate; same behavior as today. → pinned in Task 4 unit test (leader links are inside an `isLeader` conditional).
- **Photo fails to load / is absent** — masthead must not collapse: a `bg-[#111]` sits behind the `<img>` so the title block still reads. → pinned in Task 3 unit test (root carries the fallback bg; title renders regardless of image).
- **Run with an emoji and/or a long name** — `<h1>` must still render the full name (per-run.spec asserts the DB name in `header h1`); object-position keeps heads in frame. → name rendering pinned in Task 7; crop is a Preview check.
- **My Plan empty state (non-leader, 0 follows)** — still gets a masthead, not a bare `Header`; the "Browse all runs" CTA still navigates. → pinned in Task 5 (both branches mount `Masthead`; `Header` import removed from the page).

---

### Task 1: Hero photo assets in `public/hero/`

**Files:**
- Create: `public/hero/my-plan.jpg`, `public/hero/all-runs.jpg`, `public/hero/run-detail.jpg`
- Source: `scratch/nbr-assets/` (gitignored originals)

**Interfaces:**
- Produces: three web paths `/hero/my-plan.jpg`, `/hero/all-runs.jpg`, `/hero/run-detail.jpg` consumed by Tasks 5–7.

- [ ] **Step 1: Copy + downscale the three chosen B&W photos** (prototype assignments: My Plan → run-photo-2, All Runs → run-photo-6, Run Detail → run-photo-4). macOS `sips` downscales to ≤1200px wide; then confirm size.

```bash
mkdir -p public/hero
sips -Z 1200 -s format jpeg -s formatOptions 70 \
  scratch/nbr-assets/run-photo-2-image_67181313JPG-bw.jpg --out public/hero/my-plan.jpg
sips -Z 1200 -s format jpeg -s formatOptions 70 \
  scratch/nbr-assets/run-photo-6-IMG_6635jpg-bw.jpg --out public/hero/all-runs.jpg
sips -Z 1200 -s format jpeg -s formatOptions 70 \
  scratch/nbr-assets/run-photo-4-IMG_3679jpg-bw.jpg --out public/hero/run-detail.jpg
```

- [ ] **Step 2: Verify the assets exist and are reasonably sized**

```bash
ls -la public/hero/ && du -h public/hero/*.jpg
```
Expected: three files present, each well under ~300 KB. If any is larger, lower `formatOptions` (e.g. 60) and re-run.

- [ ] **Step 3: Commit**

```bash
git add public/hero/my-plan.jpg public/hero/all-runs.jpg public/hero/run-detail.jpg
git commit -m "feat(#513): add downscaled B&W hero photo assets"
```

---

### Task 2: Characterization lock — hero control contract on My Plan + Run Detail

Written **before** any reskin, passing against the **current** `Header`, so relocating the controls into the masthead can't silently drop them. `/all-runs` is already covered by [header.spec.ts](../../../e2e/header.spec.ts); this adds `/my-plan` and `/runs/[id]`, the two screens whose controls move.

**Files:**
- Create: `e2e/hero-masthead.spec.ts`

- [ ] **Step 1: Write the characterization spec**

```ts
import { test, expect, type Page } from '@playwright/test'

// #513 (NBR v2 Story 3) — CHARACTERIZATION spec for the hero-screen control
// contract. Written BEFORE the masthead replaces the Header on /my-plan and
// /runs/[id], so a hand-edit that drops a control turns this red instead of
// relying on a Preview eyeball. BEHAVIOR ONLY — roles, aria, href, navigation —
// never visual classes. Must stay green through the masthead mount (Tasks 5, 7).
//
// Default storageState is the seeded test leader (playwright.config.ts), so the
// UserButton leader menu is present. /all-runs is already covered by header.spec.ts.

function menuItem(page: Page, name: RegExp) {
  return page
    .getByRole('menuitem', { name })
    .or(page.getByRole('link', { name }))
    .or(page.getByRole('button', { name }))
}
async function openUserMenu(page: Page) {
  await page.locator('.cl-userButtonTrigger').click()
}

for (const path of ['/my-plan', '/runs/tuesday-morning-tigerwolves']) {
  test.describe(`hero controls present on ${path} (#513 characterization)`, () => {
    test('FeedbackButton renders', async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      await expect(page.getByRole('button', { name: 'Feedback' })).toBeVisible()
    })

    test('leader UserButton menu: Run Settings → /run-config', async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      await openUserMenu(page)
      const runSettings = menuItem(page, /run settings/i)
      await expect(runSettings).toBeVisible()
      await runSettings.click()
      await page.waitForURL('**/run-config')
      expect(new URL(page.url()).pathname).toBe('/run-config')
    })

    test('leader UserButton menu: Edit Workouts → /admin', async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      await openUserMenu(page)
      const editWorkouts = menuItem(page, /edit workouts/i)
      await expect(editWorkouts).toBeVisible()
      await editWorkouts.click()
      await page.waitForURL('**/admin')
      expect(new URL(page.url()).pathname).toBe('/admin')
    })
  })
}
```

- [ ] **Step 2: Run it against the current app to verify it PASSES now** (the current `Header` renders these controls on both screens).

Run: `npx playwright test e2e/hero-masthead.spec.ts`
Expected: PASS (6 tests). If local e2e is unavailable, note it and rely on CI; the spec is authored to pass against the pre-reskin `Header`.

- [ ] **Step 3: Commit**

```bash
git add e2e/hero-masthead.spec.ts
git commit -m "test(#513): characterize hero-screen control contract before masthead"
```

---

### Task 3: `Masthead` component (TDD)

**Files:**
- Create: `components/Masthead.tsx`
- Test: `__tests__/masthead.test.ts`

**Interfaces:**
- Produces:
  ```ts
  Masthead(props: {
    photoSrc: string
    photoAlt: string
    title: string
    kicker?: string
    subtitle?: string
    underline?: boolean          // default false
    objectPosition?: string      // default 'center'
    heightClassName?: string     // default 'h-[232px]'
    brandStart?: React.ReactNode // default: the NBR white logo <img>
    brandEnd?: React.ReactNode
  }): JSX.Element
  ```
  Server component (no hooks) rendered as the screen's `<header>`. Consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Write the failing test** (render via `react-dom/server` — node-safe, no new deps)

```ts
// __tests__/masthead.test.ts
import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import Masthead from '../components/Masthead'

const render = (props: Partial<Parameters<typeof Masthead>[0]> = {}) =>
  renderToStaticMarkup(
    React.createElement(Masthead, {
      photoSrc: '/hero/my-plan.jpg',
      photoAlt: 'NBR runners',
      title: 'My Plan',
      ...props,
    } as any),
  )

describe('Masthead (#513)', () => {
  test('renders the title inside an h1 within a header landmark', () => {
    const html = render({ title: 'My Plan' })
    expect(html).toMatch(/<header[^>]*>/)
    expect(html).toMatch(/<h1[^>]*>My Plan<\/h1>/)
  })
  test('renders the kicker when provided, omits it otherwise', () => {
    expect(render({ kicker: 'Your week' })).toContain('Your week')
    expect(render()).not.toContain('Your week')
  })
  test('renders the subtitle in a <p> when provided, omits it otherwise', () => {
    const withSub = render({ subtitle: 'Tuesday · 6:30 AM' })
    expect(withSub).toMatch(/<p[^>]*>Tuesday · 6:30 AM<\/p>/)
    expect(render()).not.toContain('Tuesday · 6:30 AM')
  })
  test('applies the warm photo scrim', () => {
    expect(render()).toContain('rgba(32,26,22,0.6)')
  })
  test('carries a solid fallback bg so the title reads if the photo fails', () => {
    expect(render()).toContain('bg-[#111]')
  })
  test('renders the photo with its alt and tuned object-position', () => {
    const html = render({ photoAlt: 'NBR Sunday Funday', objectPosition: 'center 8%' })
    expect(html).toContain('alt="NBR Sunday Funday"')
    expect(html).toContain('center 8%')
  })
  test('defaults the brand row to the NBR white logo; renders brandEnd', () => {
    const html = render({ brandEnd: React.createElement('span', null, 'CONTROLS') })
    expect(html).toContain('src="/nbr-logo.png"')
    expect(html).toContain('CONTROLS')
  })
  test('renders the underline only when underline is true', () => {
    expect(render({ underline: true })).toContain('w-[46px]')
    expect(render({ underline: false })).not.toContain('w-[46px]')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/masthead.test.ts`
Expected: FAIL — cannot find `../components/Masthead`.

- [ ] **Step 3: Implement `components/Masthead.tsx`**

```tsx
import type { ReactNode } from 'react'

// #513 (NBR v2 Story 3) — full-bleed B&W photographic masthead for hero screens
// (My Plan, All Runs, Run Detail). Presentational server component: it renders the
// screen's <header> landmark (title in <h1>, subtitle in <p> — per-run.spec selects
// those). brandStart/brandEnd are overlay slots for the brand row; brandEnd carries
// the account/leader/feedback controls (HeaderControls) over the photo. Utility
// screens keep the compact Header instead — the hero-vs-browse rhythm (spec #510).
export default function Masthead({
  photoSrc,
  photoAlt,
  title,
  kicker,
  subtitle,
  underline = false,
  objectPosition = 'center',
  heightClassName = 'h-[232px]',
  brandStart,
  brandEnd,
}: {
  photoSrc: string
  photoAlt: string
  title: string
  kicker?: string
  subtitle?: string
  underline?: boolean
  objectPosition?: string
  heightClassName?: string
  brandStart?: ReactNode
  brandEnd?: ReactNode
}) {
  return (
    <header className={`relative ${heightClassName} overflow-hidden bg-[#111]`}>
      <img
        src={photoSrc}
        alt={photoAlt}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition }}
      />
      {/* warm scrim so white type reads over the photo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(32,26,22,0.6) 0%, rgba(32,26,22,0.12) 42%, rgba(32,26,22,0.86) 100%)',
        }}
      />
      {/* brand row */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <div className="flex items-center">
          {brandStart ?? (
            <img src="/nbr-logo.png" alt="North Brooklyn Runners" className="h-7 w-auto" />
          )}
        </div>
        {brandEnd && <div className="flex items-center">{brandEnd}</div>}
      </div>
      {/* title block */}
      <div className="absolute inset-x-4 bottom-[18px]">
        {kicker && (
          <div className="mb-[7px] font-display text-[10px] font-medium uppercase tracking-[0.2em] text-white/80">
            {kicker}
          </div>
        )}
        <h1 className="m-0 font-display text-[38px] font-normal leading-[0.95] tracking-[0.005em] text-white">
          {title}
        </h1>
        {subtitle && <p className="mt-2 font-sans text-[13px] font-light text-white/85">{subtitle}</p>}
        {underline && <div className="mt-3 h-[2px] w-[46px] bg-white" />}
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/masthead.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add components/Masthead.tsx __tests__/masthead.test.ts
git commit -m "feat(#513): add Masthead hero component (TDD)"
```

---

### Task 4: Extract `HeaderControls` from `Header` (shared control cluster)

Pulls the right-side control cluster out of `Header` so the masthead and the compact header render the *same* component — one source of truth for the leader menu, sign-in link, and feedback button.

**Files:**
- Create: `components/HeaderControls.tsx`
- Modify: `components/Header.tsx`
- Modify: `__tests__/headerShell.test.ts`
- Test: `__tests__/headerControlsShell.test.ts`

**Interfaces:**
- Produces: `HeaderControls(props: { isLeader: boolean }): JSX.Element` — a `'use client'` component. Consumed by `Header` and by Tasks 5–7 (masthead `brandEnd`).

- [ ] **Step 1: Write the failing unit test for the new component**

```ts
// __tests__/headerControlsShell.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/HeaderControls.tsx'), 'utf8')

describe('HeaderControls (#513)', () => {
  test('is a client component', () => {
    expect(src).toContain("'use client'")
  })
  test('retains the signed-in flash guard (isLoaded)', () => {
    expect(src).toContain('isLoaded')
  })
  test('renders the Clerk UserButton with both leader links', () => {
    expect(src).toContain('UserButton')
    expect(src).toContain('Run Settings')
    expect(src).toContain('Edit Workouts')
  })
  test('renders the signed-out sign-in link and the FeedbackButton', () => {
    expect(src).toContain('/sign-in')
    expect(src).toContain('FeedbackButton')
  })
  test('gates the leader links behind isLeader', () => {
    expect(src).toContain('isLeader')
  })
})
```

- [ ] **Step 2: Update `headerShell.test.ts`** — the `isLoaded` guard moves into `HeaderControls`; `Header` now delegates to it. Replace the third test:

```ts
// in __tests__/headerShell.test.ts — replace the 'isLoaded guard is retained' test with:
  test('delegates the control cluster to HeaderControls', () => {
    expect(src).toContain('HeaderControls')
  })
```
(Keep the `bg-chrome` and `/nbr-logo.png` tests unchanged.)

- [ ] **Step 3: Run both unit tests to verify they fail**

Run: `npx vitest run __tests__/headerControlsShell.test.ts __tests__/headerShell.test.ts`
Expected: FAIL — `HeaderControls.tsx` not found; `Header` doesn't yet contain `HeaderControls`.

- [ ] **Step 4: Create `components/HeaderControls.tsx`** (moved verbatim from `Header` — same roles, aria, hrefs, Clerk config)

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { Settings, Wrench } from 'lucide-react'
import FeedbackButton from './FeedbackButton'
import { PersonIcon } from './icons'

// #513: extracted from Header so the hero mastheads and the compact utility Header
// render the identical account/leader/feedback cluster — one behavioral contract,
// proven by header.spec.ts (/all-runs) and hero-masthead.spec.ts (/my-plan, /runs/[id]).
export default function HeaderControls({ isLeader }: { isLeader: boolean }) {
  const pathname = usePathname()
  const { isLoaded, isSignedIn } = useUser()

  return (
    <div className="flex items-center gap-2.5">
      {/* Render only once Clerk has resolved auth state, so a signed-in user never
          briefly sees the sign-in link (the #366 bounce bug). */}
      {isLoaded &&
        (isSignedIn ? (
          <UserButton appearance={{ elements: { userButtonAvatarBox: 'w-10 h-10' } }}>
            <UserButton.MenuItems>
              {isLeader && (
                <UserButton.Link label="Run Settings" labelIcon={<Settings size={16} />} href="/run-config" />
              )}
              {isLeader && (
                <UserButton.Link label="Edit Workouts" labelIcon={<Wrench size={16} />} href="/admin" />
              )}
            </UserButton.MenuItems>
          </UserButton>
        ) : (
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(pathname)}`}
            title="Sign in"
            aria-label="Sign in"
            className="w-10 h-10 flex-none rounded-full bg-white/10 flex items-center justify-center text-chrome-muted touch-manipulation"
          >
            <PersonIcon size={22} />
          </Link>
        ))}
      <FeedbackButton />
    </div>
  )
}
```

- [ ] **Step 5: Rewrite `Header.tsx` to delegate** — remove the Clerk/useUser/usePathname/FeedbackButton imports now owned by `HeaderControls`; render `<HeaderControls isLeader={isLeader} />` in the right slot. Keep the back-chevron (router.back), logo, and title/subtitle rows unchanged.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import HeaderControls from './HeaderControls'

export default function Header({
  title,
  subtitle,
  isLeader,
  showBack,
}: {
  title: string
  subtitle?: string
  isLeader: boolean
  showBack?: boolean
}) {
  const router = useRouter()

  return (
    <header className="sticky top-0 z-30 bg-chrome px-4 pt-4 pb-3 mb-3">
      {/* Top brand row: logo left, controls right */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              className="text-chrome-text touch-manipulation"
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
          )}
          <img src="/nbr-logo.png" alt="North Brooklyn Runners" className="h-7 w-auto" />
        </div>
        <HeaderControls isLeader={isLeader} />
      </div>
      {/* Page title / subtitle row */}
      <div>
        <h1 className="font-display text-3xl font-normal text-chrome-text">{title}</h1>
        {subtitle && (
          <p className="font-display uppercase tracking-[0.14em] text-[10px] text-chrome-muted mt-1">{subtitle}</p>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 6: Run unit tests + tsc**

Run: `npx vitest run __tests__/headerControlsShell.test.ts __tests__/headerShell.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 7: Run the existing Header characterization e2e to confirm no behavioral drift** (still points at `/all-runs` + `/run-config`)

Run: `npx playwright test e2e/header.spec.ts`
Expected: PASS (4 tests). If local e2e is unavailable, note it and rely on CI.

- [ ] **Step 8: Commit**

```bash
git add components/HeaderControls.tsx components/Header.tsx __tests__/headerControlsShell.test.ts __tests__/headerShell.test.ts
git commit -m "refactor(#513): extract shared HeaderControls from Header"
```

---

### Task 5: Mount `Masthead` on My Plan

**Files:**
- Modify: `app/my-plan/page.tsx`

**Interfaces:**
- Consumes: `Masthead` (Task 3), `HeaderControls` (Task 4), `/hero/my-plan.jpg` (Task 1).

- [ ] **Step 1: Replace the `Header` import with `Masthead` + `HeaderControls`** and mount on BOTH the empty-state and populated branches. The empty-state CTA block and `MyPlanClient` stay unchanged; only the header element changes.

```tsx
// app/my-plan/page.tsx — swap the import line
import Masthead from '@/components/Masthead'
import HeaderControls from '@/components/HeaderControls'
// (remove: import Header from '@/components/Header')
```

Empty-state branch header:
```tsx
<Masthead
  photoSrc="/hero/my-plan.jpg"
  photoAlt="NBR runners"
  kicker="Across the runs you follow"
  title="My Plan"
  underline
  brandEnd={<HeaderControls isLeader={isLeader} />}
/>
```
Populated branch header (same, swap the `<Header ... />` line for the identical `<Masthead ... />` above).

- [ ] **Step 2: Grep to confirm `Header` is fully removed from this page**

Run: `rg -n "Header" app/my-plan/page.tsx`
Expected: no matches (only `Masthead` / `HeaderControls` remain).

- [ ] **Step 3: tsc + the hero + my-plan specs**

Run: `npx tsc --noEmit && npx playwright test e2e/hero-masthead.spec.ts e2e/my-plan.spec.ts`
Expected: PASS (hero controls still reachable on `/my-plan`; my-plan body behavior unchanged). If local e2e is unavailable, rely on CI.

- [ ] **Step 4: Commit**

```bash
git add app/my-plan/page.tsx
git commit -m "feat(#513): My Plan adopts the hero masthead"
```

---

### Task 6: Mount `Masthead` on All Runs + rewrite the superseded AC10

**Files:**
- Modify: `app/all-runs/page.tsx`
- Modify: `e2e/all-runs.spec.ts` (AC10 only)

**Interfaces:**
- Consumes: `Masthead`, `HeaderControls`, `/hero/all-runs.jpg`.

- [ ] **Step 1: Rewrite the AC10 test FIRST** — Story 3 intentionally reintroduces the NBR brand eyebrow (kicker), so the old "no NORTH BROOKLYN RUNNERS eyebrow" negative is retired. Keep the still-valid parts: no legacy "Join NBR", sign-in link present for logged-out, header landmark + logo present.

```ts
// e2e/all-runs.spec.ts — replace the AC10 test body:
test('All Runs masthead: logo + logged-out sign-in link; no legacy "Join NBR" (AC10, #513)', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto('/all-runs')
  await page.waitForLoadState('load')
  // #513: the photographic masthead reintroduces an NBR kicker by design — the old
  // "no NORTH BROOKLYN RUNNERS eyebrow" assertion is intentionally retired here.
  await expect(page.locator('header')).toBeVisible()
  await expect(page.locator('header img[alt="North Brooklyn Runners"]')).toBeVisible()
  await expect(page.getByText('Join NBR', { exact: false })).toHaveCount(0)
  await expect(page.locator('a[href*="sign-in"]')).toBeVisible()
  await context.close()
})
```

- [ ] **Step 2: Swap the header in `app/all-runs/page.tsx`**

```tsx
import Masthead from '@/components/Masthead'
import HeaderControls from '@/components/HeaderControls'
// (remove: import Header from '@/components/Header')
```
```tsx
<Masthead
  photoSrc="/hero/all-runs.jpg"
  photoAlt="NBR Sunday Funday"
  kicker="North Brooklyn Runners"
  title="All Runs"
  underline
  brandEnd={<HeaderControls isLeader={isLeader} />}
/>
```
(`AllRunsClient`, including its intro band and leader CTA, stays unchanged below.)

- [ ] **Step 3: tsc + all-runs + hero specs**

Run: `npx tsc --noEmit && npx playwright test e2e/all-runs.spec.ts e2e/hero-masthead.spec.ts`
Expected: PASS (rewritten AC10 green; all other all-runs behavior unchanged). If local e2e is unavailable, rely on CI.

- [ ] **Step 4: Commit**

```bash
git add app/all-runs/page.tsx e2e/all-runs.spec.ts
git commit -m "feat(#513): All Runs adopts the hero masthead; retire superseded AC10 eyebrow assertion"
```

---

### Task 7: Mount `Masthead` on Run Detail (+ `BackButton`)

The real-run render adopts the masthead; the two "Run not found" branches keep the compact `Header` (an error state has no photo context). The `RunFollowToggle` stays in its current position below the masthead (it's a substantive interactive control; the prototype's top-right "Following ✓" is only a static indicator — moving the toggle is out of scope and higher-risk). A new `BackButton` fills the masthead `brandStart` (the prototype's "← Back").

**Files:**
- Create: `components/BackButton.tsx`
- Test: `__tests__/backButtonShell.test.ts`
- Modify: `app/runs/[id]/page.tsx`

**Interfaces:**
- Consumes: `Masthead`, `HeaderControls`, `/hero/run-detail.jpg`.
- Produces: `BackButton(): JSX.Element` — `'use client'`, calls `router.back()`, `aria-label="Go back"`.

- [ ] **Step 1: Write the failing unit test for `BackButton`**

```ts
// __tests__/backButtonShell.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/BackButton.tsx'), 'utf8')

describe('BackButton (#513)', () => {
  test('is a client component that calls router.back()', () => {
    expect(src).toContain("'use client'")
    expect(src).toContain('router.back()')
  })
  test('has an accessible label', () => {
    expect(src).toContain('aria-label="Go back"')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/backButtonShell.test.ts`
Expected: FAIL — `BackButton.tsx` not found.

- [ ] **Step 3: Create `components/BackButton.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

// #513: back affordance for the Run Detail masthead brand row (prototype "← Back").
export default function BackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      aria-label="Go back"
      className="flex items-center text-white touch-manipulation"
    >
      <ChevronLeft size={24} strokeWidth={2.5} />
    </button>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/backButtonShell.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount the masthead on the real-run render in `app/runs/[id]/page.tsx`** — keep the `Header` import for the two not-found branches; add the new imports; replace only the main `<Header ... />`.

```tsx
import Masthead from '@/components/Masthead'
import HeaderControls from '@/components/HeaderControls'
import BackButton from '@/components/BackButton'
// keep: import Header from '@/components/Header'  (used by the "Run not found" branches)
```
Replace the main header block (the `<Header title={`${emoji}…`} subtitle={subtitleParts.join(' · ')} isLeader={isOwningLeader} />`) with:
```tsx
<Masthead
  photoSrc="/hero/run-detail.jpg"
  photoAlt={runConfig.name}
  title={`${runConfig.emoji ? `${runConfig.emoji} ` : ''}${runConfig.name}`}
  subtitle={subtitleParts.join(' · ')}
  objectPosition="center 12%"
  heightClassName="h-[210px]"
  brandStart={<BackButton />}
  brandEnd={<HeaderControls isLeader={isOwningLeader} />}
/>
```
(The `RunFollowToggle`, description, and `GroupRunClient` blocks below stay unchanged. No `kicker`/`underline` — `subtitle` carries the day·time, keeping `header p` populated with "Tuesday".)

- [ ] **Step 6: tsc + the run-detail contract specs + hero spec**

Run: `npx tsc --noEmit && npx playwright test e2e/per-run.spec.ts e2e/hero-masthead.spec.ts`
Expected: PASS — `header h1` still contains the run name, `header p` still contains "Tuesday" (subtitle), follow toggle + edit affordances + not-found all unchanged; hero controls reachable on `/runs/[id]`. If local e2e is unavailable, rely on CI.

- [ ] **Step 7: Commit**

```bash
git add components/BackButton.tsx __tests__/backButtonShell.test.ts app/runs/[id]/page.tsx
git commit -m "feat(#513): Run Detail adopts the hero masthead with back affordance"
```

---

### Task 8: Full verification + Preview handoff

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green. (`npm run test:unit` is the CI equivalent, run against the test-data branch.)

- [ ] **Step 2: Full e2e locally where possible** (the hero/header/my-plan/all-runs/per-run specs are the ones this story touches)

Run: `npx playwright test e2e/hero-masthead.spec.ts e2e/header.spec.ts e2e/my-plan.spec.ts e2e/all-runs.spec.ts e2e/per-run.spec.ts`
Expected: all green. If local e2e is unavailable, rely on CI.

- [ ] **Step 3: Preview visual check (Lou)** — on the PR's Preview URL, confirm against the prototype: mastheads on My Plan / All Runs / Run Detail show the B&W photo + scrim + Jost title; subjects' heads stay in frame (tune `objectPosition` per screen if not); the account avatar + feedback button are legible over the photo; utility screens (Library, Races, Schedule, config) still show the compact dark `Header`. No schema migration in this story — no DB steps.

---

## Noticed, out of scope (flag to Lou, do not fix here)

- `app/my-plan/page.tsx` empty-state CTA uses `rounded-full bg-orange-500` — pre-existing non-NBR styling (orange + pill) that will look off under the new masthead. Not a Story 3 deliverable (mastheads only); worth a one-line follow-up (`bg-ink`, square) or folding into Story 4.
