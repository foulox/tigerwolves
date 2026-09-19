// ─────────────────────────────────────────────────────────────────────────────
// Story #426 — curated REAL-data test fixtures.
//
// A one-time extract of real production workouts (host ep-super-waterfall, query
// in the #426 issue body), frozen here as literal values. The e2e/unit suites
// seed from this instead of hand-invented rows, so the tests exercise every UI
// shape against data one edit removed from what leaders actually see — and no
// fixture invents a SEPARATE run shadowing a real one (the old shadow run —
// run id doves, name "Mourning Doves" — this story deletes).
//
// Coverage (AC3): 2 real families of each supported quality type owned by
// TigerWolves — Hills, Broken Tempo, Progression, Ladder, Superset, Straight
// Tempo, Intervals — plus 1 Threshold (prod has only one). "Straight Tempo"'s
// second family is the real "Generic Tempo", retyped from the legacy `Tempo`
// type here to mirror production after scripts/migrate-426.sql runs. The 2 Long
// families live on the real `wednesday-mourning-doves` run (CURATED_DOVES_ROUTES),
// not on TigerWolves. Easy is deferred (prod has none; its shape ≈ Long).
//
// Each coverage family carries a single representative variant so the Library row
// count is deterministic (the add-variation e2e adds a second variant at runtime).
// One family ("800s") is flagged so the flag-review round-trip e2e has a real
// target. A 16th family ("Domino Park Loop") is a real 2-variant family reserved
// for the admin regroup e2e — the real-data replacement for the old fake
// "McCarren Loop Repeats" fixture. Total TigerWolves variant rows = 15 + 2 = 17.
// ─────────────────────────────────────────────────────────────────────────────

export type VariantFixture = {
  label: string | null
  sortOrder: number | null
  rawInput: string
  /** Route/long workouts carry a distance instead of an interval block. */
  distTime?: string
  mapLink?: string
  flagged?: boolean
  flagNote?: string
}

export type FamilyFixture = {
  name: string
  category: string
  type: string
  reason: string
  variants: VariantFixture[]
}

/** A single-variant helper — the common shape for these curated families. */
function fam(
  name: string,
  type: string,
  reason: string,
  rawInput: string,
  distTime: string,
  extra: Partial<VariantFixture> = {},
): FamilyFixture {
  return {
    name,
    category: 'Quality',
    type,
    reason,
    variants: [{ label: null, sortOrder: null, rawInput, distTime, ...extra }],
  }
}

// TigerWolves owns every quality-type family. Values are frozen real rows.
export const CURATED_FAMILIES: FamilyFixture[] = [
  // ── Hills ──
  fam(
    'Hills - 2 Sets 7x30s', 'Hills',
    'Short, fast hill reps in sets — builds leg power and quick turnover on gradients.',
    'WU: Easy jog to hill. Main: 2 sets of (7 × 30s up the hill, jog back down). 1 min walk/jog rest between sets. Option: 3 sets if feeling strong. CD: Easy jog home.',
    '5–6 miles',
  ),
  fam(
    'Hills - Ladder', 'Hills',
    'Builds hill-specific strength across a range of rep durations in one session.',
    'WU: Easy jog to hill. Main: 3 × (15s / 30s / 45s / 60s / 45s / 30s / 15s hill repeats). Jog back down as recovery after each rep. CD: Easy jog home.',
    '5–6 miles',
  ),

  // ── Broken Tempo ── ("800s" carries the flag for the flag-review e2e)
  fam(
    '800s', 'Broken Tempo',
    'High volume at 5K pace — builds VO2 max and speed endurance.',
    'WU: 15 min easy. Main: 8 × 800m at 5K pace with 3 min rest. CD: 10 min easy.',
    '7–8 miles',
    { flagged: true, flagNote: "We've been running 6x800m lately, not 8 — worth double-checking." },
  ),
  fam(
    'Kostas Fartlek', 'Broken Tempo',
    'Tempo work with active recovery at marathon pace — keeps aerobic stimulus high throughout. Never fully resting.',
    'WU: 15 min easy. Main: 3 × (5 min at tempo pace / 5 min at marathon pace). CD: 10 min easy.',
    '7–8 miles',
  ),

  // ── Progression ──
  fam(
    'Progression w/ Rests', 'Progression',
    'Raises threshold while minimizing aerobic stress. Roughly 9 miles at threshold pace without the full load of a continuous run.',
    'WU: 15 min easy. Main: 2-3 × (10 min at marathon pace / 5 min at half marathon pace) with 3 min easy jog/walk recovery. CD: 10 min easy.',
    '8–9 miles',
  ),
  fam(
    'Rowland Tempo', 'Progression',
    'Progressive tempo sets — each rep builds from just below to just above tempo, teaching the body to accelerate on tired legs.',
    'WU: 15 min easy. Main: 3 sets of (3 min slightly below tempo / 3 min at tempo / 3 min slightly above tempo). 2 min recovery between sets. CD: 10 min easy.',
    '7–8 miles',
  ),

  // ── Ladder ──
  fam(
    'Ladder - 1 to 5 to 1', 'Ladder',
    'Full ladder with half-time recovery — trains a range of paces from 5K to HMP. Good benchmark workout every 4–6 weeks.',
    'WU: 15 min easy. Main Option 1: 1-2-3-4-5-4-3-2-1 min, rest = half the previous rep (e.g. 1min hard = 30sec rest). Pace: 5K on the way up, HMP at the top, back to 5K. Option 2: extend to 1-2-3-4-5-6-5-4-3-2-1 min for 36 total tempo minutes. CD: 10 min easy.',
    '7–8 miles',
  ),
  fam(
    'The Moneghetti', 'Ladder',
    'Great re-introduction to speedwork — short reps are mentally manageable. Also works as a 20-min benchmark session. Named after 4-time Olympic marathoner Steve Moneghetti.',
    'WU: Easy jog. Main: 2×(90s on/90s float) + 4×(60s on/60s float) + 4×(30s on/30s float) + 4×(15s on/15s float). CD: Easy.',
    '6–7 miles',
  ),

  // ── Superset ──
  fam(
    '10K Alternating Laps', 'Superset',
    'Made famous by Salvatore Antibo, the 1988 Olympic 10K silver medalist, who ran the National Club Championship as an alternating-pace fartlek. A demanding option for an athlete who needs a hard, race-specific session; not for everyone.',
    '10K of alternating 400m @ 3K pace & 400m @ HM',
    '10K (~6.2 miles)',
  ),
  fam(
    "Sir Blake's SuperSet", 'Superset',
    'Sharpen speed while building endurance — trains the body to handle pace changes and recover on the move. Great for NYC Half or 5K/10K training.',
    'WU: Easy jog. Main: 2 sets of (3 min at 5K pace / 3 min jog / 10 min at tempo / 3 min jog). CD: Easy.',
    '7–8 miles',
  ),

  // ── Straight Tempo ── (second family is the real "Generic Tempo", retyped from
  // the legacy `Tempo` type — mirrors prod after scripts/migrate-426.sql)
  fam(
    'Straight Tempo', 'Straight Tempo',
    "Hard aerobic run — the most basic threshold workout. Can't be overlooked. Sometimes just getting through it has a big impact regardless of pace.",
    '25–35 minutes continuous at tempo pace (typically 5–10 sec faster than half marathon pace). No stopping.',
    '6–8 miles',
  ),
  fam(
    'Generic Tempo', 'Straight Tempo',
    'A tempo run elevates your lactate threshold, training your body to clear metabolic byproducts more efficiently at higher speeds, and builds the mental grit to hold a "comfortably hard" pace.',
    'WU: 1–2 mi easy. Main: 30–45 min@tempo. CD: 1–2 mi easy.',
    'Generic Tempo Run',
  ),

  // ── Intervals ──
  fam(
    'Generic Track Intervals', 'Intervals',
    'Interval training improves maximal oxygen uptake and running economy by challenging the body above race pace, then building lactate tolerance across the recovery periods.',
    'WU: 1–2 mi easy. Main: 10×400m@5K, r90s. CD: 1–2 mi easy.',
    '',
  ),
  fam(
    "300m's on Down", 'Intervals',
    'Introduces the race-specific coordination demanded by 1,500m pace. The short reps keep the pace tolerable while the workout still adds up to a good amount of quality work.',
    '2 x (8 x 300m) w/ 45 sec rec btwn reps, 4 min btwn sets',
    '3–4 miles (intervals only), ~5–6 miles total with warmup/cooldown',
  ),

  // ── Threshold ── (prod has exactly one)
  fam(
    'Power Endurance for Elites', 'Threshold',
    'Long intervals at 10K–15K pace — raises threshold by running faster than threshold. Prepares for the half marathon with a higher stimulus.',
    'WU: 15 min easy. Main: Choose — 2×(3K+2K+1K), 4×3K, or 5×1.5mi. Pace: 3K and 2K at 10K race pace, 1K at 5K-3K race pace. CD: 10 min easy.',
    '8–10 miles',
  ),

  // ── Reserved: a real 2-variant family for the admin regroup e2e (the real-data
  // successor to the old fake "McCarren Loop Repeats"). Not referenced by any other
  // spec's name assertions, so the regroup that consumes it can't disturb them.
  {
    name: 'Domino Park Loop', category: 'Quality', type: 'Intervals',
    reason: 'Repeats around the Domino Park 800m loop with standing rest — a flexible interval session.',
    variants: [
      { label: '8 x 800m', sortOrder: 1, rawInput: '800m loop around Domino Park with standing rest between each rep — 8 reps.', distTime: '4–5 miles' },
      { label: '10 x 800m', sortOrder: 2, rawInput: '800m loop around Domino Park with standing rest between each rep — 10 reps.', distTime: '4–6 miles' },
    ],
  },
]

// Two real Long routes for the `wednesday-mourning-doves` run (from the #411
// Mourning Doves library). Route shape: a distance + a map link, no interval
// block. Seeded onto the REAL run, not a shadow — this is what AC1 fixes.
export const CURATED_DOVES_ROUTES: { name: string; distTime: string; mapLink: string }[] = [
  { name: 'All The Water Fountains', distTime: '9.4 miles', mapLink: 'https://www.strava.com/routes/3506443192297552740' },
  { name: 'Roosevelt Island', distTime: '11.25 miles', mapLink: 'https://www.strava.com/routes/24312406' },
]

// The three REAL run ids the e2e/unit suites seed — the single source of truth for
// the shadow-run guard (__tests__/fixtureGuard.test.ts). No id here may be a
// near-miss (edit-distance ≤ 1) of another, and none may be an invented shadow.
export const SEEDED_RUNS: { id: string; name: string }[] = [
  { id: 'tigerwolves', name: 'TigerWolves' },
  { id: 'mmer', name: 'Monday Morning Easy Run' },
  { id: 'wednesday-mourning-doves', name: 'Wednesday Mourning Doves' },
]
