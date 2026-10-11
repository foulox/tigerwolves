# NBR Brand-True Reskin (v2) — Story 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `globals.css` to the real NBR palette, swap Geist → Jost/Mulish, and reskin the app-wide chrome (Header, BottomNav) — the foundation every later v2 story builds on.

**Architecture:** Tailwind v4 `@theme` tokens + `next/font/google`. Reskin only — no logic or data changes. Visual source of truth: [`2026-10-11-nbr-prototype.html`](2026-10-11-nbr-prototype.html) (open in a browser).

**Tech Stack:** Next.js App Router, Tailwind CSS v4, `next/font/google` (Jost, Mulish), Clerk (`UserButton` in Header).

**Spec:** [`2026-10-11-nbr-redesign-spec.md`](2026-10-11-nbr-redesign-spec.md) (banked alongside this plan; design-system evidence in [`2026-10-11-nbr-design-system.md`](2026-10-11-nbr-design-system.md)).

## Global Constraints
- **Reskin only — preserve 100% of capabilities.** "Did any capability change?" is the review gate.
- Monochrome palette; **cyan `#00c3eb` for links only**, never decoration.
- **Square corners** (radius 0).
- **Free fonts:** Jost (≈ Futura PT, display), Mulish (≈ Europa, body). No Adobe Fonts.
- Surface **white** `#ffffff`; chrome **black** `#000000`; ink `#1f1f1f`.
- **Each story ships independently — Story 1 must not leave the app broken.** `--color-accent` stays *defined* (repointed red→ink) so components not yet migrated (cards, screens in Stories 2/4/5) keep rendering monochrome instead of breaking. The final story removes the token once no consumer references it.
- PWA `themeColor` → `#000000` (currently `#0e0e0e`).

## Review Focus
- **Signed-in leader Header:** `<UserButton>` + leader menu links (Run Settings, Edit Workouts) still render and navigate after the reskin — **test-enforced by `e2e/header.spec.ts` (Task 4), not just eyeballed** (Task 5 look-check).
- **Back-chevron** (was `text-accent` red): still fires `router.back()` — **test-enforced (Task 4)** — and is visible in white-on-dark (Task 5 look-check).
- **Bottom-nav active state:** the current tab reads as active (white + top rule) on every screen, signed-in and out. (Task 6; tab hrefs/role-gating already guarded by `e2e/nav.spec.ts`)
- **Dark-chrome contrast:** `--color-chrome-muted` on `#000` must meet WCAG AA (≥4.5:1). NBR's own dark-gray `#747474` on black is only ~4.0:1 → **keep chrome-muted at `#9aa0a6`** (passes); `#747474` is for muted text on *white* surfaces only. (Task 2)
- **Font wiring:** `font-display` / `font-sans` utilities actually generate from `@theme` + the `next/font` CSS variables — headings render in Jost, body in Mulish, not a fallback serif. (Tasks 1–2)

---

### Task 1: Load Jost + Mulish, drop Geist

**Files:**
- Modify: `app/layout.tsx:9` (font import) and `:46` (body className), `:36` (themeColor)

**Interfaces:**
- Produces: CSS variables `--font-jost` (Jost) and `--font-mulish` (Mulish) on `<body>`, mapped to the `--font-display` / `--font-sans` theme tokens in `globals.css` `@theme` (Task 2). **The next/font variable names are deliberately distinct from the Tailwind theme-token names** — a shared name produces a self-referential `--font-sans: var(--font-sans)` in `@theme`, the classic font-wiring trap this story's Review Focus warns about.

- [ ] **Step 1: Swap the font imports**
```tsx
import { Jost, Mulish } from 'next/font/google'
const display = Jost({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-jost', display: 'swap' })
const sans = Mulish({ subsets: ['latin'], weight: ['300','400','500','600','700'], variable: '--font-mulish', display: 'swap' })
```
- [ ] **Step 2: Update `<body>` className**
From `${geist.className} bg-surface h-full antialiased` to:
```tsx
className={`${display.variable} ${sans.variable} font-sans bg-surface h-full antialiased`}
```
- [ ] **Step 3: Set `themeColor: '#000000'`** in the `viewport` export.
- [ ] **Step 4: Typecheck** — Run: `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(#<epic>): load Jost + Mulish, drop Geist"`

### Task 2: Migrate the `@theme` tokens

**Files:**
- Modify: `app/globals.css:6-20` (`@theme` block + `:root` font mapping)

- [ ] **Step 1: Replace the `@theme` block**
```css
@theme {
  --color-chrome: #000000;
  --color-chrome-text: #ffffff;
  --color-chrome-muted: #9aa0a6;   /* AA on black (≥4.5:1) */
  --color-warm: #201a16;           /* photo scrims / warm panels */
  --color-surface: #ffffff;
  --color-card: #ffffff;
  --color-line: #e6e5e5;
  --color-ink: #1f1f1f;
  --color-muted: #747474;          /* muted text on white */
  --color-link: #00c3eb;           /* cyan — LINKS ONLY */
  --color-accent: #1f1f1f;         /* DEPRECATED: red→ink so un-migrated
                                      components stay monochrome; removed in final story */
  --font-display: var(--font-jost);    /* next/font var, named distinctly to avoid self-reference */
  --font-sans: var(--font-mulish);
}
```
Delete the old `:root { --font-sans: var(--font-geist-sans) }` line (now handled in `@theme`).
- [ ] **Step 2: Unit tests unaffected** — Run: `npm run test:unit` → green (no visual tests; this confirms nothing logical broke).
- [ ] **Step 3: Typecheck** — Run: `npx tsc --noEmit` → clean.
- [ ] **Step 4: Visual check** — push branch, open the Preview URL. App is monochrome on white surfaces; no red anywhere; cards not yet migrated render ink, not red; headings are Jost, body Mulish. Matches the prototype's chrome tone.
- [ ] **Step 5: Commit** — `git commit -m "feat(#<epic>): migrate design tokens to real NBR palette"`

### Task 3: Swap in the real NBR white logo

**Files:**
- Replace: `public/nbr-logo.png`

- [ ] **Step 1: Copy the asset** — `cp docs/superpowers/plans/assets/nbr-redesign-logo-white.png public/nbr-logo.png` (real white bridge mark + wordmark, pulled from NBR's CDN; `Header` already references `/nbr-logo.png`).
- [ ] **Step 2: Visual check** — Preview: logo renders crisp white in the dark header.
- [ ] **Step 3: Commit** — `git commit -m "feat(#<epic>): use real NBR white wordmark logo"`

### Task 4: Header behavioral-contract spec (characterization — write FIRST)

Lock the interactive contract of the chrome *before* reskinning it, so a hand-edit that silently drops a behavior turns a test red instead of relying on the Preview eyeball. This is a **characterization** spec: it must pass against the *current* (pre-reskin) `Header`, then stay green through Tasks 5–6. It asserts behavior (roles, hrefs, aria, navigation) — never visual classes/colors/fonts, which are *meant* to change.

**Files:**
- Create: `e2e/header.spec.ts`

**Coverage (the uncovered affordances this epic rewrites):**
- Back-chevron: has `aria-label="Go back"` and fires navigation (`router.back()`).
- `UserButton` leader menu (signed-in leader): exposes **Run Settings** → `/run-config` and **Edit Workouts** → `/admin`.
- `FeedbackButton` renders.
- *(BottomNav's contract — tab hrefs, labels, role-gating — is already covered by `e2e/nav.spec.ts`; Header *identity* by `e2e/all-runs.spec.ts`. This spec fills the Header interaction gap only, no duplication.)*

- [ ] **Step 1: Write the spec** against the current `Header` (signed-in leader fixture for the menu assertions; a back-nav flow for the chevron).
- [ ] **Step 2: Run it green on main's Header** — `npm run test:e2e` (or the targeted spec) passes *before* any reskin edit. This proves it characterizes real current behavior, not an aspiration.
- [ ] **Step 3: Commit** — `git commit -m "test(#<epic>): characterize Header interactive contract before reskin"`

### Task 5: Reskin Header

**Files:**
- Modify: `components/Header.tsx`

**Visual target:** prototype `.k-head` / `.k-logo-img` / masthead brand row.

**Guard:** `e2e/header.spec.ts` (Task 4) must stay green after every step below — it is the behavior-preserved check.

- [ ] **Step 1: Title → Jost regular, title-case** — change the `<h1>` class `text-2xl font-extrabold text-chrome-text tracking-[-0.01em]` → `font-display text-3xl font-normal text-chrome-text`.
- [ ] **Step 2: Back-chevron** — change `text-accent` → `text-chrome-text`; keep `onClick={() => router.back()}`.
- [ ] **Step 3: Subtitle → uppercase Jost label** — `font-display uppercase tracking-[0.14em] text-[10px] text-chrome-muted`.
- [ ] **Step 4: Logo** — keep `src="/nbr-logo.png"`; set `className="h-7 w-auto"`.
- [ ] **Step 5: Verify** — `npx tsc --noEmit`; **`e2e/header.spec.ts` still green** (behavior preserved); Preview as signed-in leader confirms the *look*: UserButton + menu links present, back-nav works, title in Jost.
- [ ] **Step 6: Commit** — `git commit -m "feat(#<epic>): reskin Header to NBR chrome"`

### Task 6: Reskin BottomNav

**Files:**
- Modify: `components/BottomNav.tsx`

**Visual target:** prototype `.k-nav` (active = white + 2px top rule; labels uppercase Jost).

- [ ] **Step 1: Labels** — change tab class `text-xs font-medium` → `font-display uppercase tracking-[0.1em] text-[9px] font-medium`.
- [ ] **Step 2: Active color** — replace `text-accent` (active) with `text-white`; inactive stays `text-chrome-muted`.
- [ ] **Step 3: Active top rule** — on the active `<Link>`, render a 2px top indicator (add `relative` to the link and a `<span className="absolute top-0 inset-x-[22%] h-0.5 bg-white" />` when `active`).
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; **`e2e/nav.spec.ts` still green** (tab hrefs/labels/role-gating preserved); Preview (runner + leader): active tab white + top rule on every screen; icon stroke still thickens on active.
- [ ] **Step 5: Commit** — `git commit -m "feat(#<epic>): reskin BottomNav to NBR chrome"`

---

## Self-Review
- **Coverage:** fonts (T1), tokens (T2), logo (T3), Header behavioral spec (T4), Header reskin (T5), BottomNav reskin (T6) — all Story-1 surface covered.
- **Placeholders:** none.
- **Type consistency:** token names unchanged for consumers (`bg-chrome`, `text-chrome-text`, `text-chrome-muted`, `text-accent` preserved but repointed to ink). `font-display`/`font-sans` utilities referenced consistently; next/font vars (`--font-jost`/`--font-mulish`) named distinctly from theme tokens to avoid self-reference.
- **Review Focus:** chrome-muted AA held at `#9aa0a6` (T2); accent-repoint prevents breaking un-migrated components (Global Constraints); **Header interactive contract is test-enforced (T4 characterization spec), not eyeball-only**; BottomNav contract covered by existing `nav.spec.ts`; remaining UserButton/back-nav/nav-active items are *visual* look-checks on Preview (T5/T6).
