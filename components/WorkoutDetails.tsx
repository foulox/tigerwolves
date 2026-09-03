import type { WorkoutVariantRow } from '@/lib/data'

export const PHASE_COLORS: Record<string, string> = {
  Base: 'bg-blue-100 text-blue-700',
  Build: 'bg-orange-100 text-orange-700',
  Peak: 'bg-red-100 text-red-700',
  Taper: 'bg-green-100 text-green-700',
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold text-gray-700">{label}: </span>
      <span className="text-gray-600">{value}</span>
    </div>
  )
}

export function ChipRow({ label, chips, getChipClass }: {
  label: string
  chips: string[]
  getChipClass?: (chip: string) => string
}) {
  return (
    <div>
      <div className="font-semibold text-gray-700 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(chip => (
          <span
            key={chip}
            className={`text-xs rounded-full px-2.5 py-0.5 ${getChipClass ? getChipClass(chip) : 'bg-gray-100 text-gray-700'}`}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  )
}

type ExcludeField = 'raceTypes' | 'trainingPhases' | 'author'

export default function WorkoutDetails({ w, exclude = [] }: {
  w: WorkoutVariantRow
  exclude?: ExcludeField[]
}) {
  const showRaceTypes = !exclude.includes('raceTypes')
  const showPhases = !exclude.includes('trainingPhases')
  const showAuthor = !exclude.includes('author')

  const hasContent = !!(
    w.reason ||
    w.energySystem ||
    w.hrZone ||
    w.rpe ||
    (w.hasTurnaround && w.turnaround) ||
    (showPhases && w.trainingPhases.length > 0) ||
    (showRaceTypes && w.raceTypes.length > 0) ||
    (showAuthor && w.author) ||
    w.mapLink
  )

  if (!hasContent) return null

  return (
    <div className="space-y-2 text-sm">
      {w.reason && <DetailRow label="Reason" value={w.reason} />}
      {w.energySystem && <DetailRow label="Energy System" value={w.energySystem} />}
      {(w.hrZone || w.rpe) && (
        <div className="flex gap-4">
          {w.hrZone && <DetailRow label="HR Zone" value={w.hrZone} />}
          {w.rpe && <DetailRow label="RPE" value={w.rpe} />}
        </div>
      )}
      {w.hasTurnaround && w.turnaround && <DetailRow label="Turnaround" value={w.turnaround} />}
      {showPhases && w.trainingPhases.length > 0 && (
        <ChipRow
          label="Training Phases"
          chips={w.trainingPhases}
          getChipClass={p => PHASE_COLORS[p] ?? 'bg-gray-100 text-gray-500'}
        />
      )}
      {showRaceTypes && w.raceTypes.length > 0 && (
        <ChipRow label="Race Types" chips={w.raceTypes} />
      )}
      {showAuthor && w.author && <DetailRow label="Author" value={w.author} />}
      {w.mapLink && (
        <a
          href={w.mapLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-blue-500 touch-manipulation block"
        >
          Map ↗
        </a>
      )}
    </div>
  )
}
