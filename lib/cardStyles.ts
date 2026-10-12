// NBR Story-2 card skin — single source for the reskin so the label/link/chip
// styles can't drift across the four card frames. Tailwind v4 class strings.
// `font-display` = Jost (wired by Story 1). Cyan = links only. Square corners.

/** Inline navigational text link: View route ↗, Map ↗, Show details, + Add variation. */
export const CARD_LINK =
  'font-display uppercase tracking-[0.1em] text-[11px] font-medium text-link no-underline touch-manipulation'

/** Workout type: bare uppercase label, no pill background/border. */
export const TYPE_LABEL =
  'font-display uppercase tracking-[0.14em] text-[10px] font-medium text-muted whitespace-nowrap'

/** Typography base shared by phase-chip overrides and the full square label. */
export const SQUARE_LABEL_BASE =
  'font-display uppercase tracking-[0.1em] text-[10px] font-medium px-2 py-1'

/** Phase / race / variation chip: square bordered label. */
export const SQUARE_LABEL = `${SQUARE_LABEL_BASE} text-muted border border-line`

/** "NEXT UP" eyebrow: wide-tracked ink label. */
export const NEXT_UP_LABEL =
  'font-display uppercase tracking-[0.2em] text-[9px] font-semibold text-ink'

/** Button-shaped navigational control (Edit schedule →, Edit in library →): ink outline, square. */
export const OUTLINE_BTN =
  'font-display uppercase tracking-[0.1em] text-[10px] font-medium text-ink border border-ink px-3 py-1 active:bg-surface touch-manipulation whitespace-nowrap'

/** Workout name: Jost regular, title-case (markup supplies the case). */
export const CARD_NAME = 'font-display font-normal text-[19px] text-ink leading-tight'

/** Browse-screen filter chip (.k-chip): square, uppercase Jost; ink-filled when active. */
export const filterChip = (active: boolean) =>
  `shrink-0 font-display uppercase tracking-[0.1em] text-[11px] font-medium px-3 py-1.5 touch-manipulation transition-colors ${
    active ? 'bg-ink text-white border border-ink' : 'bg-transparent text-ink border border-line'
  }`

/** Search field wrapper (.k-search): square hairline box holding a glyph + borderless input. */
export const SEARCH_FIELD = 'flex items-center gap-2.5 border border-line bg-card px-3 py-2.5'

/** Borderless search input inside SEARCH_FIELD. */
export const SEARCH_INPUT =
  'w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none'
