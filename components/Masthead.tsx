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
  heightClassName = 'aspect-[390/232]',
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
