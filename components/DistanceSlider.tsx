'use client'

// Story #461: one-line dual-thumb range (the price-filter pattern) for the
// non-workout distance axis. Two <input type=range> overlaid on one track;
// pointer-events gated to the thumbs; a fill marks the selected span.
export default function DistanceSlider({
  bounds, value, onChange,
}: {
  bounds: { min: number; max: number }
  value: { min: number; max: number }
  onChange: (r: { min: number; max: number }) => void
}) {
  const span = bounds.max - bounds.min
  const pct = (v: number) => (span <= 0 ? 0 : ((v - bounds.min) / span) * 100)
  return (
    <div>
      <div className="text-center text-[14px] text-ink mb-1">
        <b className="font-semibold">{value.min.toFixed(1)}</b> &ndash; <b className="font-semibold">{value.max.toFixed(1)} mi</b>
      </div>
      <div className="relative h-[34px] mx-[7px]">
        <div className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 bg-line" />
        <div className="absolute top-1/2 h-[3px] -translate-y-1/2 bg-ink" style={{ left: `${pct(value.min)}%`, right: `${100 - pct(value.max)}%` }} />
        <input
          type="range" aria-label="Minimum distance" min={bounds.min} max={bounds.max} step={0.1} value={value.min}
          onChange={e => onChange({ min: Math.min(+e.target.value, value.max), max: value.max })}
          className="dual-range absolute inset-x-0 top-0 h-[34px] w-full appearance-none bg-transparent touch-manipulation pointer-events-none"
        />
        <input
          type="range" aria-label="Maximum distance" min={bounds.min} max={bounds.max} step={0.1} value={value.max}
          onChange={e => onChange({ min: value.min, max: Math.max(+e.target.value, value.min) })}
          className="dual-range absolute inset-x-0 top-0 h-[34px] w-full appearance-none bg-transparent touch-manipulation pointer-events-none"
        />
      </div>
      <div className="flex justify-between text-[9px] tracking-[0.08em] uppercase text-muted mx-[7px]">
        <span>{bounds.min.toFixed(1)} mi</span><span>{bounds.max.toFixed(1)} mi</span>
      </div>
    </div>
  )
}
