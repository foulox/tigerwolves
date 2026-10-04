# NBR reskin — Story 1: shell + theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app read as the NBR app everywhere — dark chrome (header with logo + bottom nav), the NBR color system as CSS tokens, and the app name as NBR — without changing any capability.

**Architecture:** A Tailwind v4 `@theme` palette of semantic tokens (chrome + content zones + accent) in `globals.css`. The per-page `Header` becomes the dark NBR header carrying the logo; `BottomNav` and the body background go dark/new-surface. App-brand strings + manifest + metadata + PWA icons flip to NBR. Run-level references (the TigerWolves `postHeader` run defaults) stay.

**Tech Stack:** Next.js 16.2.4 (App Router), Tailwind CSS v4 (`@theme`), TypeScript, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-04-nbr-reskin-design.md`

**Branch:** build on the `redesign/nbr` integration branch (see spec → Delivery). Do not merge to `main` until all three reskin stories are verified together.

## Global Constraints

- **Reskin only — preserve 100% of capabilities.** Every existing e2e spec must stay green **unchanged**. If a reskin forces an e2e edit, that's a behavior change — stop and justify or revert.
- **MLP, not MVP** — minimal scope, genuinely great quality. Looks must feel lovable, not merely rebranded.
- **Palette as CSS custom properties / Tailwind `@theme` tokens** — components use semantic utilities (`bg-chrome`, `bg-surface`, `text-accent`…), never new hardcoded hex.
- **NBR palette (verbatim):** chrome `#0e0e0e`, chrome-text `#ffffff`, chrome-muted `#9aa0a6`, surface `#f6f6f6`, card `#ffffff`, border `#e7e7e7`, text `#0e0e0e`, muted `#4a5464`, accent `#f0523d`.
- **App name:** "North Brooklyn Runners" / short "NBR". Run-level `postHeader` fallbacks (`🐯🐺 TigerWolves Tuesday Workout`) stay literal.
- **Logo committed locally** to `public/` — no hotlinking.
- **Accessibility:** icon-only controls keep `aria-label`; dark chrome + accent meet contrast.

## Review Focus

- **Any capability change** (auth controls, nav gating, back button, feedback) introduced by restyling the shared `Header`/`BottomNav` → the unchanged-e2e gate catches it. (Tasks 5, 6)
- **Leader-only Schedule tab** must still be gated on server `isLeader`, not client state, after the nav restyle. (Task 6 — `nav`/`gating` e2e)
- **Signed-in user never flashes the sign-in link** (the #366 bug) after the header restyle — the `isLoaded` guard stays. (Task 5)
- **PWA still installs** after the manifest/icon change — valid manifest, icons resolve, `theme_color` applied. (Task 3 — `manifest.test.ts`)
- **Contrast** — `chrome-muted` text on `chrome`, and `accent` on dark/light, meet WCAG AA for the sizes used. (Task 1 note + Task 7 visual)

---

### Task 1: NBR theme tokens (Tailwind v4 `@theme`)

Establishes the semantic utilities every later task uses.

**Files:**
- Modify: `app/globals.css`
- Test: `__tests__/nbrTheme.test.ts`

**Interfaces:**
- Produces Tailwind utilities: `bg-chrome`, `text-chrome-text`, `text-chrome-muted`, `bg-surface`, `bg-card`, `border-line`, `text-ink`, `text-muted`, `bg-accent`, `text-accent` (Tailwind v4 generates these from `--color-*` tokens).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/nbrTheme.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8')

describe('NBR theme tokens (#466)', () => {
  test('globals.css declares the NBR palette in @theme', () => {
    expect(css).toContain('@theme')
    expect(css).toMatch(/--color-chrome:\s*#0e0e0e/)
    expect(css).toMatch(/--color-chrome-text:\s*#ffffff/)
    expect(css).toMatch(/--color-chrome-muted:\s*#9aa0a6/)
    expect(css).toMatch(/--color-surface:\s*#f6f6f6/)
    expect(css).toMatch(/--color-card:\s*#ffffff/)
    expect(css).toMatch(/--color-line:\s*#e7e7e7/)
    expect(css).toMatch(/--color-ink:\s*#0e0e0e/)
    expect(css).toMatch(/--color-muted:\s*#4a5464/)
    expect(css).toMatch(/--color-accent:\s*#f0523d/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/nbrTheme.test.ts`
Expected: FAIL — no `@theme` block yet.

- [ ] **Step 3: Add the `@theme` block to `app/globals.css`**

```css
@import "tailwindcss";

/* #466 NBR reskin — semantic color tokens. Chrome = dark app bars/nav;
   content = light surfaces/cards; accent = NBR's sampled red, used sparingly.
   Values hardcoded to NBR (tenant config is backlogged, #486). */
@theme {
  --color-chrome: #0e0e0e;
  --color-chrome-text: #ffffff;
  --color-chrome-muted: #9aa0a6;
  --color-surface: #f6f6f6;
  --color-card: #ffffff;
  --color-line: #e7e7e7;   /* borders (→ border-line) */
  --color-ink: #0e0e0e;    /* body text (→ text-ink) */
  --color-muted: #4a5464;
  --color-accent: #f0523d;
}

:root {
  --font-sans: var(--font-geist-sans);
}

@keyframes slideUp {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/nbrTheme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css __tests__/nbrTheme.test.ts
git commit -m "feat(#466): NBR semantic color tokens (Tailwind v4 @theme)"
```

---

### Task 2: Commit the NBR logo asset

**Files:**
- Create: `public/nbr-logo.png` (the white wordmark, for dark chrome)

- [ ] **Step 1: Add the logo to `public/`**

The white NBR wordmark was saved during the brainstorm at `docs/superpowers/specs/assets/tenant-config/nbr-logo.png`. Copy it into `public/`:

```bash
cp docs/superpowers/specs/assets/tenant-config/nbr-logo.png public/nbr-logo.png
file public/nbr-logo.png   # confirm it's a real image
```

(If that file is absent, re-download from NBR's site: the `new_nbr_logo_v2` asset on their Squarespace CDN — white line-art wordmark on transparent.)

- [ ] **Step 2: Verify it resolves**

Confirm `public/nbr-logo.png` exists and is non-empty. It will serve at `/nbr-logo.png`.

- [ ] **Step 3: Commit**

```bash
git add public/nbr-logo.png
git commit -m "feat(#466): add NBR logo asset"
```

---

### Task 3: App name → NBR (manifest, metadata, PWA icons)

The manifest/metadata values **change** here (unlike anything invisible) — update the pinning tests to the NBR values.

**Files:**
- Modify: `app/manifest.ts`
- Modify: `app/layout.tsx` (metadata title/appleWebApp, viewport themeColor)
- Modify: `__tests__/manifest.test.ts` (retarget to NBR values)
- Create: NBR PWA icons in `public/` (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png` — overwrite the TigerWolves emoji icons)

**Interfaces:**
- Consumes: the logo asset (Task 2).

- [ ] **Step 1: Regenerate NBR PWA icons**

The app icon is square; the NBR wordmark is wide, so use the **bridge-badge** portion of the logo (or a simple "NBR" monogram) on the chrome-dark background `#0e0e0e`. Adapt the existing generator `scripts/generate-pwa-icons.mjs` (Playwright-rendered) to produce the three sizes, or hand-produce them. Output `public/icon-192.png`, `public/icon-512.png`, `public/icon-512-maskable.png` (maskable = mark centered in the ~80% safe zone).

- [ ] **Step 2: Update the manifest pinning test to NBR values**

In `__tests__/manifest.test.ts`, change the asserted values:
```ts
expect(m.name).toBe('North Brooklyn Runners')
expect(m.short_name).toBe('NBR')
expect(m.theme_color).toBe('#0e0e0e') // chrome dark (was orange)
expect(m.background_color).toBe('#0e0e0e')
```
(Keep the icon-count/standalone/maskable structural assertions.)

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run __tests__/manifest.test.ts`
Expected: FAIL — manifest still returns TigerWolves/orange.

- [ ] **Step 4: Update `app/manifest.ts`**

```ts
    name: 'North Brooklyn Runners',
    short_name: 'NBR',
    description: 'North Brooklyn Runners — runs, schedules, and workouts',
    // ...
    background_color: '#0e0e0e',
    theme_color: '#0e0e0e',
```

- [ ] **Step 5: Update `app/layout.tsx` metadata + viewport**

```ts
title: 'North Brooklyn Runners',
description: 'North Brooklyn Runners — runs, schedules, and workouts',
appleWebApp: { capable: true, statusBarStyle: 'default', title: 'NBR' },
// viewport:
themeColor: '#0e0e0e',
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run __tests__/manifest.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/manifest.ts app/layout.tsx __tests__/manifest.test.ts public/icon-192.png public/icon-512.png public/icon-512-maskable.png
git commit -m "feat(#466): manifest + metadata + PWA icons → NBR"
```

---

### Task 4: App-brand strings → NBR

Replace only the app-brand `TigerWolves` strings; leave run-level ones.

**Files:**
- Modify: `components/WhatsNewOverlay.tsx:60` ("Recent updates to TigerWolves" → NBR)
- Modify: `app/roadmap/page.tsx:58` ("Where TigerWolves is going" → NBR)
- Modify: `lib/whatsNew.ts:14` ("See where TigerWolves is headed" → NBR)
- Modify: `app/all-runs/page.tsx:7` (`title: 'All Runs — TigerWolves'` → `'All Runs — NBR'`)
- Test: `__tests__/brandStrings.test.ts`
- **Do NOT touch:** `app/library/page.tsx:19`, `app/schedule/page.tsx:15` (run-level `postHeader`). **Classify at build:** `components/AllRunsClient.tsx:218` ("See the TigerWolves schedule →") — leave if it links the TigerWolves run.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/brandStrings.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { WHATS_NEW } from '../lib/whatsNew'

const read = (p: string) => readFileSync(path.resolve(__dirname, '..', p), 'utf8')

describe('app-brand strings say NBR; run-level stay (#466)', () => {
  test('whatsNew Roadmap entry references NBR, not TigerWolves', () => {
    const r = WHATS_NEW.find((e) => e.title === 'Roadmap')!
    expect(r.description).toContain('NBR')
    expect(r.description).not.toContain('TigerWolves')
  })
  test('app-brand files no longer say TigerWolves', () => {
    expect(read('components/WhatsNewOverlay.tsx')).not.toContain('to TigerWolves')
    expect(read('app/roadmap/page.tsx')).not.toContain('TigerWolves is going')
    expect(read('app/all-runs/page.tsx')).not.toContain('All Runs — TigerWolves')
  })
  test('run-level postHeader fallbacks are left literal', () => {
    expect(read('app/library/page.tsx')).toContain('🐯🐺 TigerWolves Tuesday Workout')
    expect(read('app/schedule/page.tsx')).toContain('🐯🐺 TigerWolves Tuesday Workout')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/brandStrings.test.ts`
Expected: FAIL — literals still present.

- [ ] **Step 3: Make the edits**

- `components/WhatsNewOverlay.tsx:60` → `Recent updates to NBR`
- `app/roadmap/page.tsx:58` → `subtitle="Where NBR is going"`
- `lib/whatsNew.ts:14` → `description: 'See where NBR is headed — what\'s live now, what\'s coming next, and what\'s on the horizon.'`
- `app/all-runs/page.tsx:7` → `title: 'All Runs — NBR'`

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run __tests__/brandStrings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/WhatsNewOverlay.tsx app/roadmap/page.tsx lib/whatsNew.ts app/all-runs/page.tsx __tests__/brandStrings.test.ts
git commit -m "feat(#466): app-brand strings → NBR (run-level refs left)"
```

---

### Task 5: Dark NBR header (with logo)

Restyle the shared `Header` into the dark NBR chrome carrying the logo. **Preserve every control** (back, UserButton, sign-in, feedback) and the `isLoaded` guard.

**Files:**
- Modify: `components/Header.tsx`
- Test: existing e2e (`e2e/nav.spec.ts`, `e2e/gating.spec.ts`) must stay green unchanged; add `__tests__/headerShell.test.ts` (source assertions).

- [ ] **Step 1: Write the source-assertion test**

```ts
// __tests__/headerShell.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/Header.tsx'), 'utf8')

describe('NBR dark header (#466)', () => {
  test('header uses the dark chrome token, not the old light bg', () => {
    expect(src).toContain('bg-chrome')
    expect(src).not.toContain('bg-gray-50')
  })
  test('header renders the NBR logo', () => {
    expect(src).toContain('/nbr-logo.png')
  })
  test('the signed-in flash guard (isLoaded) is retained', () => {
    expect(src).toContain('isLoaded')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/headerShell.test.ts`
Expected: FAIL — header still `bg-gray-50`, no logo.

- [ ] **Step 3: Restyle `components/Header.tsx`**

Convert the header to dark chrome: `bg-chrome` background, `text-chrome-text` title, `text-chrome-muted` subtitle, accent for the back chevron (`text-accent`). Add the NBR logo (`<img src="/nbr-logo.png" alt="North Brooklyn Runners" />`, small, in the top row). **Keep the entire right-side block unchanged in behavior** — the `isLoaded && (isSignedIn ? <UserButton…/> : <Link sign-in/>)` logic and `<FeedbackButton />` stay exactly as-is; only their container's colors adapt to dark. Keep `aria-label`s.

- [ ] **Step 4: Run the source test + the header-touching e2e**

Run: `npx vitest run __tests__/headerShell.test.ts`
Expected: PASS.
Run (behavior gate): `npm run test:e2e -- nav.spec.ts gating.spec.ts`
Expected: PASS, with **no edits** to those specs.

- [ ] **Step 5: Commit**

```bash
git add components/Header.tsx __tests__/headerShell.test.ts
git commit -m "feat(#466): dark NBR header with logo (controls preserved)"
```

---

### Task 6: Dark bottom nav

**Files:**
- Modify: `components/BottomNav.tsx`
- Test: `__tests__/bottomNavShell.test.ts` (source) + existing `e2e/nav.spec.ts` green unchanged.

- [ ] **Step 1: Write the source-assertion test**

```ts
// __tests__/bottomNavShell.test.ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
const src = readFileSync(path.resolve(__dirname, '../components/BottomNav.tsx'), 'utf8')

describe('NBR dark bottom nav (#466)', () => {
  test('nav uses dark chrome, not white', () => {
    expect(src).toContain('bg-chrome')
    expect(src).not.toContain('bg-white')
  })
  test('active tab uses the accent token, not orange', () => {
    expect(src).toContain('text-accent')
    expect(src).not.toContain('text-orange-500')
  })
  test('leader-only Schedule gating is unchanged', () => {
    expect(src).toContain('leaderOnly')
    expect(src).toContain("t.leaderOnly || isLeader")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/bottomNavShell.test.ts`
Expected: FAIL — nav still white/orange.

- [ ] **Step 3: Restyle `components/BottomNav.tsx`**

`bg-chrome` background, `border-border`→a dark divider (`border-white/10`), inactive `text-chrome-muted`, active `text-accent`. **Do not touch** the `allTabs` list, the `leaderOnly` filter, `aria-label`s, or `data-tour` attributes.

- [ ] **Step 4: Run source test + nav e2e**

Run: `npx vitest run __tests__/bottomNavShell.test.ts`
Expected: PASS.
Run: `npm run test:e2e -- nav.spec.ts`
Expected: PASS, spec unedited.

- [ ] **Step 5: Commit**

```bash
git add components/BottomNav.tsx __tests__/bottomNavShell.test.ts
git commit -m "feat(#466): dark NBR bottom nav (tabs + gating preserved)"
```

---

### Task 7: Global background + full-shell verification

**Files:**
- Modify: `app/layout.tsx` (body background)

- [ ] **Step 1: Switch the body background to the NBR surface**

In `app/layout.tsx`, change the body class `bg-gray-50` → `bg-surface`. (Chrome bars supply their own dark bg; content screens get the new light surface.)

- [ ] **Step 2: Full unit suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Full e2e suite — the capability gate**

Run: `npm run test:e2e`
Expected: PASS, with **zero edits** to any existing spec. Any spec that needs editing = a capability change — stop and reconsider.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(#466): global NBR surface background"
```

- [ ] **Step 5: Visual verification on the integration-branch Preview**

Push `redesign/nbr`; on its Preview confirm against the Option 1 mockups (`assets/tenant-config/`): dark header with the NBR logo, dark bottom nav with accent active state, light content surface, app titled NBR, PWA installs with the NBR icon + dark theme color. Spot-check that it still reads well with a run leader signed in (UserButton visible, Schedule tab present).

---

## Notes for the executor

- **No DB / migration.** Code + assets only.
- **This is the shell** — screen bodies (All Runs hero/cards, run detail, Library, Races, Schedule, My Plan) are restyled in Stories 2 and 3. After this story the app is NBR-chromed but screen interiors still use old colors; that's expected and fine, because nothing merges to `main` until all three land together.
- **The capability gate is sacred:** if any existing e2e spec needs an edit to pass, a reskin changed behavior — fix the reskin, not the test.
- **Contrast:** verify `text-chrome-muted` (`#9aa0a6`) on `#0e0e0e` and `text-accent` (`#f0523d`) are legible at the sizes used; bump a token only with a noted reason.
