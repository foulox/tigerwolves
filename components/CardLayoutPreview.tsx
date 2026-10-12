'use client'

import { useEffect, useState } from 'react'
import WorkoutCardBody from './WorkoutCardBody'
import { pickerRecordsForRun, type PickerRecord } from '@/lib/libraryPicker'
import type { CardTemplate, WorkoutVariantRow, ScheduleEntry, RunConfig } from '@/lib/data'
import { formatDateMedium } from '@/lib/postBuilder'
import { formatDateShort } from '@/lib/dateUtils'
import { filterChip } from '@/lib/cardStyles'

type Surface = 'myplan' | 'schedule' | 'library'

type Props = {
  template: CardTemplate
  variants: WorkoutVariantRow[]
  runConfig: RunConfig
  nextEntry: ScheduleEntry | null
}

export default function CardLayoutPreview({ template, variants, runConfig, nextEntry }: Props) {
  const records = pickerRecordsForRun(variants, runConfig)

  const [pickedId, setPickedId] = useState<number | null>(records[0]?.familyId ?? null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [surface, setSurface] = useState<Surface>('myplan')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!pickerOpen) return
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-picker-menu]')) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  if (records.length === 0) {
    return (
      <p className="text-sm text-muted italic px-1">
        Add a workout to your library to preview your card layout.
      </p>
    )
  }

  const picked: PickerRecord | null = records.find(r => r.familyId === pickedId) ?? records[0] ?? null
  const w: WorkoutVariantRow | null = picked ? picked.variants[0] : null

  const dateLabel = nextEntry?.date ? formatDateMedium(nextEntry.date) : 'Upcoming'

  return (
    <div className="flex flex-col gap-3">
      {/* Picklist */}
      <div className="relative" data-picker-menu>
        <button
          type="button"
          onClick={() => setPickerOpen(o => !o)}
          aria-label="Choose a workout to preview"
          aria-expanded={pickerOpen}
          className="w-full flex items-center justify-between border border-line bg-card px-3 py-2.5 text-sm text-ink touch-manipulation"
        >
          <span className={picked ? '' : 'text-muted'}>
            {picked ? picked.name : 'Choose a workout…'}
          </span>
          <span aria-hidden>▾</span>
        </button>
        {pickerOpen && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1.5 bg-card border border-line shadow-lg overflow-hidden max-h-72 overflow-y-auto">
            <div className="px-3 py-2 font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted bg-surface sticky top-0">
              Preview with…
            </div>
            {records.map(rec => (
              <button
                key={rec.familyId}
                type="button"
                onClick={() => {
                  setPickedId(rec.familyId)
                  setPickerOpen(false)
                  setExpanded(false)
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-left border-t border-line active:bg-surface touch-manipulation"
              >
                <span>{rec.name}</span>
                <span className="text-muted text-xs whitespace-nowrap">{rec.subtitle}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Surface tabs */}
      <div className="flex gap-1.5">
        {(['myplan', 'schedule', 'library'] as Surface[]).map(s => {
          const label = s === 'myplan' ? 'My Plan' : s === 'schedule' ? 'Schedule' : 'Library'
          return (
            <button
              key={s}
              type="button"
              aria-pressed={surface === s}
              onClick={() => { setSurface(s); setExpanded(false) }}
              className={`flex-1 text-center ${filterChip(surface === s)}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Frame — header + body share a single p-4 so the body gets the same
          horizontal/bottom padding as the real cards (MyPlanCard/LibraryClient
          mount WorkoutCardBody inside their own p-4). */}
      {w && (
        <div className="border border-line bg-card overflow-hidden">
          <div className="p-4">
            {surface === 'myplan' && (
              <>
                {/* Run identity line */}
                <div className="inline-flex items-center gap-1 font-display uppercase tracking-[0.1em] text-[11px] font-medium text-ink">
                  {runConfig.emoji ? `${runConfig.emoji} ` : ''}{runConfig.name}
                  <span aria-hidden>›</span>
                </div>
                {/* Date + type pill */}
                <div className="mt-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-muted">{dateLabel}</div>
                    <div className="mt-0.5 truncate text-base font-display font-normal text-ink">{w.name}</div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap border border-line font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted px-2 py-1">
                    {w.type}
                  </span>
                </div>
              </>
            )}

            {surface === 'schedule' && (
              <>
                <div className="font-display uppercase tracking-[0.12em] text-[11px] font-medium text-ink mb-1">Currently planned</div>
                <div className="flex justify-between items-start gap-2">
                  <div className="font-display font-normal text-ink">{w.name}</div>
                  <span className="text-xs text-muted shrink-0">
                    {w.lastRan ? formatDateShort(new Date(w.lastRan + 'T00:00:00')) : 'Never'}
                  </span>
                </div>
                {w.label && <div className="text-xs text-muted mt-0.5">{w.label}</div>}
              </>
            )}

            {surface === 'library' && (
              <>
                <div className="flex justify-between items-start gap-2">
                  <div className="font-display font-normal text-ink">{w.name}</div>
                  <span className="font-display uppercase tracking-[0.1em] text-[10px] font-medium border border-line text-muted px-2 py-1 shrink-0">
                    {w.type}
                  </span>
                </div>
                {w.label && <p className="text-xs text-muted mt-0.5">{w.label}</p>}
              </>
            )}

            <WorkoutCardBody
              workout={w}
              layout={template}
              expanded={expanded}
              onToggle={() => setExpanded(e => !e)}
            />
          </div>
        </div>
      )}

      {/* Caption */}
      <p className="text-[11px] text-muted text-center">
        Preview uses your unsaved changes. Save to apply to your run&rsquo;s cards.
      </p>
    </div>
  )
}
