# NBR Design System — extracted from northbrooklynrunners.org

**Purpose:** give the TigerWolves app a design system that is *provably* NBR's own — same typefaces, same colors, same photographic language — so it can be pitched to the NBR board as "your brand, extended into an app," not an approximation.

**Provenance:** every value below was read from the live computed styles and stylesheets of northbrooklynrunners.org on **2026-10-11** (headless Chromium via Playwright), across the homepage + Run Schedule, Team Fund, and Join NBR pages. Raw capture: [`nbr-assets/nbr-design-raw.json`](nbr-assets/nbr-design-raw.json). Reference screenshots in [`nbr-assets/`](nbr-assets/). Nothing here is invented — where I'm inferring beyond the data, it's marked _(inferred)_.

The site is built on **Squarespace** and serves its fonts through **Adobe Fonts (Typekit)**.

---

## ⚠️ Three findings that change the current app

The #466 "NBR reskin" got the *scaffold* right (dark chrome, light content) but two brand-defining choices are wrong against the real site:

1. **There is no red, and NBR is near-pure monochrome.** There is **no red anywhere** in NBR's computed styles. The app's `--color-accent: #f0523d` (globals.css, labelled "NBR's sampled red") does not come from NBR.org. The only saturated color on the site is cyan `#00c3eb`, and it is used **as the hyperlink / interactive-text color** — not as a decorative brand accent. (It also appears on the Join flow's numbered badges + button, but that's a single template; the consistent, sitewide role is "links.") The brand itself is **black, white, and gray.** _This is the single most important correction for a "built on your brand" pitch: the app should be monochrome, with cyan reserved for links._
2. **NBR is sharp-cornered.** Border-radius is `0` on buttons and brand elements. The app's `rounded-2xl` cards are off-brand. NBR's feel is editorial/architectural, not soft-app.
3. **The typefaces are Futura PT + Europa**, not Geist — and the hierarchy is subtler than "big heavy uppercase." Headlines are Futura PT **regular, title-case**. Uppercase + letter-spacing is reserved for **nav, labels, and buttons**.

---

## 1. Color tokens

All values are exact from the live site.

| Token | Hex | Source role on NBR.org |
|---|---|---|
| `nbr-ink` | `#1f1f1f` | primary text (481+ uses) — a soft near-black, **not** pure black |
| `nbr-black` | `#000000` | section/chrome backgrounds |
| `nbr-warm-black` | `#201a16` | photo overlays / alt dark panels (warm, brownish) |
| `nbr-white` | `#ffffff` | reversed text, light surfaces |
| `nbr-link` | `#00c3eb` | **hyperlink / interactive-text color** (the only saturated color on the site) — not a decorative accent |
| `nbr-gray-700` | `#414141` | strong secondary text |
| `nbr-gray-500` | `#747474` | muted text |
| `nbr-gray-400` | `#888585` | captions / disabled |
| `nbr-line` | `#e6e5e5` | hairline borders, dividers |
| `nbr-ink-50` | `rgba(31,31,31,.5)` | de-emphasized text over light |
| `nbr-white-40` | `rgba(255,255,255,.4)` | de-emphasized text over dark |

**Usage rules (observed):**
- Base palette is **monochrome** — near-black, white, grays. The brand is black-and-white; color is rare and meaningful.
- **Cyan is the only saturated color and it means "this is a link."** Use it for interactive text only — don't decorate buttons, headers, or chrome with it. (NBR's primary buttons are outline/monochrome, not cyan — see Components.)
- Dark surfaces prefer `#000` (chrome/nav) or warm `#201a16` (over photography); body copy sits at `#1f1f1f` on white, never `#000`.

> _(Inferred) An accessible cyan: `#00c3eb` on white is ~2.0:1 — fine for large UI and borders, **fails** for small body text. For small text/links on white, darken to ~`#0089a8` (≥4.5:1) and reserve the bright cyan for fills, badges, and large elements._

---

## 2. Typography tokens

Two Adobe Fonts families do all the work.

| Family | Role | Weights seen |
|---|---|---|
| **Futura PT** | display, headings, nav, labels, buttons — the "brand voice" | 300, 400, 500, 700 |
| **Europa** | body copy, long text, descriptions — the "workhorse" (556 uses vs Futura's 256) | 300, 400, 700 |

### Scale (exact px from the site)

| Role | Family / weight | Size | Transform / tracking |
|---|---|---|---|
| Display `h1` | Futura PT 400 | **44px** | title-case, no tracking |
| `h2` | Futura PT 400 | **33px** | title-case, no tracking |
| `h3` | Futura PT 400 (or 600) | **21–25px** | title-case |
| Body `p` | Europa **300** (light) | **21px** | — |
| Nav / label / button | Futura PT **500** | **13px** | **UPPERCASE, letter-spacing 2px** |

**The core typographic rule:** headlines are **Futura PT regular, title-case, generous size**. The "athletic uppercase" treatment is a *label* device — nav items, buttons, kickers — at Futura PT 500 with **2px letter-spacing**. Body is **Europa Light (300)**, set large (~21px) and airy. This is why the site reads refined-editorial rather than loud-sporty.

### Licensing / implementation (pitch-critical)
Futura PT and Europa are **Adobe Fonts**. Two paths for the app:
- **Authentic (recommended for the pitch):** an **Adobe Fonts web project** (included with any Creative Cloud subscription) embeds both families on `tigerwolves.foulox.me` via a single `<link>`. This makes the claim literally true — *the app renders in NBR's actual fonts.*
- **Free fallback:** **Jost** (Google Fonts) is a near-identical geometric Futura substitute; **Questrial** or **Mulish** approximate Europa. Visually ~90% there, zero licensing. Good for a prototype, but say so — don't claim it's "their font."

---

## 3. Shape, spacing, layout

| Token | Value | Notes |
|---|---|---|
| `radius` | **0px** | sharp corners everywhere — buttons, panels. This is a defining brand trait. |
| Button padding | `~23px 38px` | generous, rectangular hit areas |
| Borders | `2px solid` (buttons) / `1px` hairline `#e6e5e5` (dividers) | crisp, thin |
| Body measure | large body (~21px) with open line-height | editorial density, not dashboard-dense |

_(Inferred) Spacing follows a roomy rhythm — full-bleed photographic bands, generous vertical padding between sections. The feel is "printed race program," not "settings screen."_

---

## 4. Photography — the signature asset

- The **hero / brand moments are black-and-white** documentary photography of real members (the homepage track photo). These are **genuine B&W photos**, not CSS-filtered — there are **zero `grayscale()` filters** in the site's styles.
- **Secondary/contextual photos can be full color** (the Join page group shot is color). So B&W is a *hero treatment*, not a blanket rule.
- Photos run **full-bleed**, often with a dark warm overlay (`#201a16` at 50–68% opacity) so white Futura headlines sit on top.

**Implication for the app:** the single highest-impact brand move is a **full-bleed B&W photographic masthead** on key screens (All Runs, My Plan), headline in white Futura over a warm-dark scrim. This is the look nothing else reproduces.

---

## 5. Components (as NBR renders them)

### Nav link
Futura PT 500 · 13px · UPPERCASE · 2px tracking · white on black · no underline.

### Button — outline (primary brand CTA, e.g. "JOIN NBR")
Transparent bg · `2px solid currentColor` · **0 radius** · Futura PT 500 UPPERCASE 2px tracking · padding ~23×38 · white-on-dark (or ink-on-light).

### Button — filled
The sitewide default button is the **outline** style above. A **cyan filled** button appears only in the Join flow ("Accept Invite") — treat it as a template exception tied to cyan's link role, not the standard CTA. For the app, prefer the monochrome outline (or an ink-filled) button; don't make cyan the primary button color.

### Numbered step badge (Join flow only)
Small **cyan circle** with white numeral — sequenced instructions on the Join page. Same caveat: this rides cyan's link/interaction meaning, not a general accent.

### Headline + underline
Futura PT 400 title-case, white, with a **hand-drawn underline** accent under the key word ("Welcome to the _Neighborhood_"). On NBR the underline is **white**; it's a texture/emphasis device, not a color accent.

### Card / panel
Hairline `#e6e5e5` border, **square corners**, white surface, generous internal padding. No heavy shadows.

---

## 6. Voice & tone
Warm, inclusive, neighborhood-first. Real copy from the site: *"Welcome to the Neighborhood," "North Brooklyn Runners is a free running club. There are no dues and no commitments," "Run with Us!," "Welcome to NBR!"* Belonging over performance. The app's functional voice ("My Plan," "Not planned yet") should warm toward this.

---

## 7. Current app → NBR gap

| Dimension | App today (#466) | NBR actual | Action |
|---|---|---|---|
| Accent | red `#f0523d` | **cyan `#00c3eb`** | **re-token** `--color-accent` |
| Fonts | Geist | **Futura PT + Europa** | add Adobe Fonts (or Jost/Questrial) |
| Corners | `rounded-2xl` | **0** | flatten to square/`rounded-sm` |
| Headlines | Geist extrabold | **Futura PT 400 title-case** | restyle `h1`/titles |
| Labels | mixed case | **Futura 500 UPPERCASE 2px** | uppercase nav/pills/meta |
| Photography | none | **B&W full-bleed hero** | add masthead imagery |
| Dark chrome | `#0e0e0e` | `#000`/`#201a16` | minor: align to `#000` + warm panel |

What #466 got **right** and should keep: dark chrome + light content split, the PWA/mobile shell, the semantic-token approach in `globals.css` (just with corrected values).

---

## 8. Open questions / next steps
- **Fonts decision:** Adobe Fonts web project (authentic, ~needs a CC sub) vs Jost/Questrial (free, ~90%)? This gates how literally true the pitch claim is.
- **Photography source:** does NBR have a B&W photo library the app can use? The masthead direction depends on it. (Could request access to their asset library / Gallery.)
- **Red → cyan migration:** the mockup and the shipped app both need re-doing in the real palette. Worth redoing the All Runs mockup in true NBR tokens as the pitch centerpiece.
- **Scope the reskin** as an epic once the above are settled: tokens → shared primitives (Button, Nav, Card, Masthead) → screen-by-screen.

---

### Appendix — raw evidence
- Fonts: `europa` + `futura-pt` from `use.typekit.net` @font-face (Adobe Fonts).
- Accent `rgb(0,195,235)` = `#00c3eb`, 14+ uses on Join page (badges, button, links).
- Ink `rgb(31,31,31)` = `#1f1f1f`, 481+ uses. Warm-black `rgb(32,26,22)` = `#201a16` overlays.
- All heading samples: Futura PT, weight 400, no letter-spacing, title-case, sizes 44/33/21px.
- Zero `border-radius` and zero `filter: grayscale()` in computed styles.
- Full JSON: [`nbr-assets/nbr-design-raw.json`](nbr-assets/nbr-design-raw.json).
