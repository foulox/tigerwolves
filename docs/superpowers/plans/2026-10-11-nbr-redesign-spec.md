# NBR Brand-True Redesign — Epic Spec & Story Breakdown

> **Status:** draft in `scratch/` (planning while epic 423 builds). Banks into a committed epic + plan the moment 423 merges. Nothing here touches code.
> **Supersedes:** #466 (the first "NBR reskin," which introduced an **invented red** `#f0523d` not sourced from NBR). This epic corrects the brand to NBR's real design system.

## Goal
Reskin the TigerWolves app so it is *provably* built on North Brooklyn Runners' own design system — same type, color, corners, and photographic language as northbrooklynrunners.org — so Lou can pitch it to the NBR board as "your brand, extended into an app."

## Design authority
Everything here derives from two artifacts already produced and evidence-backed:
- **Design system:** [`nbr-design-system.md`](nbr-design-system.md) — tokens extracted from the live site (2026-10-11), with raw evidence in [`nbr-assets/`](nbr-assets/).
- **Clickable prototype:** [`nbr-prototype.html`](nbr-prototype.html) — all 7 screens built from the NBR kit. This is the visual target.

## Relationship to epic 423 (sequencing)
423 ("Configurable workout card layout") is **structure**; this epic is **skin**. They touch the same components but never the same concern:
- 423 builds the **shared resolver-driven card renderer** (`WorkoutCardBody` / `GroupRunCard`) and the **Card-layout config tab** (`CardTemplateTab`).
- This epic **reskins whatever 423 ships** — so it is **strictly downstream**. It starts **after 423 merges**, to avoid two branches editing the same card components at once.
- Because 423 made the card renderer *shared*, a single reskin (Story 2) propagates to My Plan, Schedule, and Library at once — 423 makes this epic smaller.

## Relationship to #466
#466 established the right *scaffold* (dark chrome / light content split, PWA shell, semantic tokens in `globals.css`). This epic keeps that scaffold and corrects the brand-defining values: red→monochrome+cyan-links, Geist→Futura/Europa, rounded→square, and adds photography. The `globals.css` "NBR's sampled red" comment gets removed.

---

## Token migration — `app/globals.css`

The whole epic turns on this `@theme` block. Current → target:

| Token | Current (#466) | Target (NBR) | Why |
|---|---|---|---|
| `--color-chrome` | `#0e0e0e` | `#000000` | NBR chrome is pure black |
| `--color-warm` *(new)* | — | `#201a16` | warm near-black for photo scrims/panels |
| `--color-surface` | `#f6f6f6` | `#ffffff` | NBR content surfaces are white **(locked)** |
| `--color-ink` | `#0e0e0e` | `#1f1f1f` | NBR's softer near-black body text |
| `--color-muted` | `#4a5464` | `#747474` | NBR gray |
| `--color-line` | `#e7e7e7` | `#e6e5e5` | NBR hairline |
| `--color-accent` (red) | `#f0523d` | **removed** | not an NBR color |
| `--color-link` *(new)* | — | `#00c3eb` | cyan — **links only**, never decoration |
| radius | `rounded-2xl` etc. | **square** (0, or 2px max) | NBR corners are hard |
| body font | `Geist` | **Mulish** (≈ Europa) | — |
| display font *(new)* | — | **Jost** (≈ Futura PT) | headings, nav, labels, buttons |

**Fonts:** add `Jost` + `Mulish` via `next/font/google` in `app/layout.tsx`, replacing `Geist`. Expose `--font-display` (Jost) and `--font-sans` (Mulish). *(Free stand-ins — the licensed Adobe Futura PT + Europa are a later one-line swap if NBR wants pixel-exact; deliberately out of scope, no paid account.)*

**Type rules** (from the site): headlines = Jost **400, title-case**; labels/nav/buttons = Jost **500, UPPERCASE, 2px tracking**; body = Mulish **300**.

---

## Component inventory (what gets reskinned)
- **`Header.tsx`** — logo + title in Jost (title-case regular, not extrabold); drop red back-chevron → ink; square.
- **`BottomNav.tsx`** — active state white + 2px top rule (not red); labels uppercase Jost; bg `#000`.
- **Shared card renderer** (`WorkoutCardBody.tsx` / `GroupRunCard.tsx`) — square cards, hairline borders, Jost names, uppercase type **labels** (not gray rounded pills), cyan links, ink-emphasis "NEXT UP" (not red stripe).
- **Primitives** — filter chips (`rounded-full`→square, uppercase Jost, ink-filled active); phase/race pills → square uppercase labels; buttons → outline (not red fill).
- **New: `Masthead.tsx`** — full-bleed B&W photo + warm scrim + Jost title + optional kicker/underline. Used on hero screens.
- **`CardTemplateTab`** (423's config screen) — restyle rows/alignment/preview to NBR. *(depends on 423 Story 2c)*
- **Screen-specific:** Library (search/filters/author lines), Races (race card, countdown, verified → monochrome).

## Screen inventory & rhythm
- **Hero screens** (arrival) get **B&W photo mastheads**: My Plan, All Runs, Run Detail.
- **Utility screens** (browse) get **compact dark headers**: Library, Races, Schedule, Card-layout config.
- This rhythm is a deliberate system rule, not per-screen whim.

## Photography
Static B&W assets to start (the set already pulled into `nbr-assets/` from NBR's Run Schedule). A real photo library / leader-upload pipeline is **out of scope / backlog** — revisit if NBR grants access to their Gallery.

---

## Decisions (locked)
- **Free fonts** Jost + Mulish (Adobe Fonts requires paid CC — declined). Real fonts are a later swap.
- **Monochrome** base; **cyan `#00c3eb` for links only**.
- **Square** corners.
- **Photos pulled from the site**, static, for now.
- **Starts after 423 merges.**

## Out of scope
- Licensed Adobe Fonts (Futura PT / Europa) — free stand-ins instead.
- A photo CMS / leader photo upload — static assets only.
- Tenant/multi-club theming (#486) and onboarding rebuild (#371) — separate epics.
- Any change to run-display **logic / data** — that's 423. This epic is visual only.

---

## Story breakdown

Each story ships independently (works if pushed alone) and fits a single sub-200K standalone agent build. Full per-task TDD plans are written just-in-time when each story is cleared (423's pattern).

**Testing rule for reskin stories (epic-wide).** A reskin changes presentation, not behavior — so `test:unit` + `tsc` staying green proves only that nothing *compiled* broke, and the Preview URL is the only check on whether it *looks* right. Neither catches a behavioral regression (a dropped `aria-label`, a broken link or click handler, a filter that silently stopped filtering) introduced while hand-editing JSX. Therefore:
- **A story that rewrites an existing interactive component must test-lock that component's behavioral contract *before* reskinning it** — write an e2e characterization spec that passes against the current component, or confirm existing specs already cover the contract, then keep it green through the reskin. This is the teeth behind every "reskin only / unaffected / still works" acceptance line; without it those lines rest on the Preview eyeball alone.
- **New components** (e.g. `Masthead`) get normal TDD — write the test with the component.
- **Purely visual** attributes (color, font, corners, spacing) stay Preview-checked against the prototype; do **not** assert Tailwind classes in tests (brittle, and they'd break on every intended restyle).
- **Do not** add visual-regression / screenshot testing: on a reskin every baseline diffs ~100% (useless signal), and it's flaky and heavy in a Preview-only setup with no working local build — wrong tool here.

### Story 1 — Foundation: tokens + fonts + global chrome
**Surface:** `app/globals.css`, `app/layout.tsx`, `Header.tsx`, `BottomNav.tsx`.
**Scope:** migrate the `@theme` tokens (table above); add Jost/Mulish, remove Geist; reskin Header + BottomNav to NBR. No screen-body or card logic touched.
**Acceptance:** app renders in Jost/Mulish; chrome is black + monochrome; nav active is white; red is gone from chrome; `test:unit` + `tsc` green; Preview looks like the prototype's chrome.
**Ships alone:** yes — immediately more NBR, nothing broken. **423 dependency:** none (chrome isn't 423's concern). **First story on branch.**

### Story 2 — Shared workout-card reskin
**Surface:** `WorkoutCardBody.tsx`, `GroupRunCard.tsx`, card primitives.
**Scope:** square cards + hairline borders; Jost names; type pills → uppercase labels; cyan links; ink "NEXT UP" emphasis; phase/race pills → square labels. Reuses Story 1 tokens.
**Acceptance:** cards match the prototype across My Plan / Schedule / Library (one shared renderer); reactions/flags unaffected; tests + tsc green; Preview visual check.
**Ships alone:** yes. **423 dependency:** the shared renderer (shipped in 423 Story 2a / #501). ✅

### Story 3 — Hero mastheads + photography
**Surface:** new `Masthead.tsx`; `app/my-plan`, `app/all-runs` (if present) / All Runs surface, `app/runs/[id]`; `public/` photo assets.
**Scope:** build `Masthead` (props: photo, title, kicker?, subtitle?, overlay content); add B&W photos to `public/`; mount on the three hero screens.
**Acceptance:** `Masthead` unit-tested (renders title/kicker, applies scrim); hero screens show mastheads per prototype; utility screens unchanged; tests + tsc green.
**Ships alone:** yes (additive). **423 dependency:** none.

### Story 4 — Browse screens: Library + Races
**Surface:** `LibraryClient.tsx`, `RacesClient.tsx` and their sub-pieces (search, filters, race card).
**Scope:** reskin the list/search/filter/author/race-card specifics not covered by the shared card renderer — square, uppercase Jost labels, monochrome verified/countdown.
**Acceptance:** Library + Races match the prototype; tests + tsc green; Preview check.
**Ships alone:** yes. **423 dependency:** none.

### Story 5 — Card-layout config screen
**Surface:** `CardTemplateTab` and its sub-components; run-config page chrome.
**Scope:** restyle the row editor (drag/move, left/right alignment, hidden bin), surface-tab picker, and live preview to NBR.
**Acceptance:** config screen matches the prototype; the embedded preview reuses the Story-2 card skin; tests + tsc green.
**Ships alone:** yes. **423 dependency:** the config screen itself (423 Story 2b/2c, #505/#507). Build this **last**, after that screen's design settles.

### (Backlog) Story 6 — Voice/copy pass
Warm functional copy toward NBR's tone ("Not planned yet," empty states). Small, independent, low priority.

---

## Sequencing & kick-off
```
423 merges ──▶ branch redesign epic ──▶ Story 1 (foundation) ──▶ Story 2 (shared card)
                                           ├─▶ Story 3 (mastheads)   [parallel-safe after S1]
                                           ├─▶ Story 4 (browse)      [parallel-safe after S2]
                                           └─▶ Story 5 (config)      [after 423 config settles]
```
Story 1 first (everything depends on its tokens). 2 depends on 1. 3 depends on 1. 4 depends on 2. 5 depends on 1 + 423's config screen. Each is a standalone PR Lou merges.

## Resolved
- **Surface color:** **white** (`--color-surface: #ffffff`), per the site. ✅
- **Logo asset:** pulled NBR's real **white bridge mark + wordmark** from their CDN (`new_nbr_logo_v2`, transparent PNG) → [`nbr-assets/logo-nbr-white.png`](nbr-assets/logo-nbr-white.png); ink variant for light surfaces at `logo-nbr-ink.png`. Now used in the prototype. *(A clean SVG would be better if NBR can supply one — PNG is fine to ship.)* ✅

## Open questions
- **"NEXT UP" emphasis without color:** prototype uses an **ink left-rule** (a near-black vertical bar on the left edge of the soonest run's card, replacing the shipped app's red border). Confirm on-device that it reads strongly enough, or go to a filled-ink header strip. *(Defer to Story 2 build — check on Preview.)*
