'use client'
import { useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { saveCardTemplate } from '@/app/run-config/actions'
import type { RunConfig, CardTemplate, CardFieldKey, WorkoutVariantRow, ScheduleEntry } from '@/lib/data'
import CardLayoutPreview from './CardLayoutPreview'
import {
  normalizeTemplate,
  moveToField,
  setAlign,
  moveRow,
  mergeRowUp,
  splitToNewRow,
  CARD_FIELD_LABELS,
  type RowSection,
} from '@/lib/cardLayoutOps'

type Props = {
  runConfig: RunConfig
  variants: WorkoutVariantRow[]
  nextEntry: ScheduleEntry | null
}

export default function CardTemplateTab({ runConfig, variants, nextEntry }: Props) {
  const [template, setTemplate] = useState<CardTemplate>(() =>
    normalizeTemplate(runConfig.cardTemplate),
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await saveCardTemplate(runConfig.id, { cardTemplate: template })
        if (result.error) {
          setError(result.error)
          return
        }
        setError('')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        Sentry.captureException(err)
        setError('Something went wrong')
      }
    })
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <SectionRows
        section="upfront"
        rows={template.upfront}
        title="● Show upfront"
        containerCls="border border-line bg-surface p-3 flex flex-col gap-2"
        titleCls="font-display uppercase tracking-[0.14em] text-[10px] font-medium text-ink"
        emptyMsg={<p className="text-[11px] text-muted italic px-1">No fields — move one here from another section.</p>}
        template={template}
        setTemplate={setTemplate}
      />

      <SectionRows
        section="expanded"
        rows={template.expanded}
        title="◐ When expanded"
        containerCls="border border-line bg-surface p-3 flex flex-col gap-2"
        titleCls="font-display uppercase tracking-[0.14em] text-[10px] font-medium text-ink"
        emptyMsg={<p className="text-[11px] text-muted italic px-1">No fields — move one here from another section.</p>}
        template={template}
        setTemplate={setTemplate}
      />

      {/* Hidden section */}
      <div className="border border-line bg-surface p-3 flex flex-col gap-2">
        <div className="font-display uppercase tracking-[0.14em] text-[10px] font-medium text-ink">
          ○ Hidden
        </div>
        <div className="flex flex-wrap gap-1.5">
          {template.hidden.map(key => (
            <HiddenChip
              key={key}
              fieldKey={key}
              onMove={dest => setTemplate(moveToField(template, key, dest))}
            />
          ))}
          {template.hidden.length === 0 && (
            <p className="text-[11px] text-muted italic">All fields are shown in a section above.</p>
          )}
        </div>
      </div>

      {/* Hint */}
      <p className="text-[11px] text-muted text-center">
        Changes show on your Library cards after you Save.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="bg-ink text-white py-3 font-display uppercase tracking-[0.1em] text-[11px] font-medium disabled:opacity-50 touch-manipulation"
      >
        {saved ? 'Saved!' : isPending ? 'Saving…' : 'Save card layout'}
      </button>

      <CardLayoutPreview template={template} variants={variants} runConfig={runConfig} nextEntry={nextEntry} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// RowSection subcomponent — shared by upfront and expanded sections
// ---------------------------------------------------------------------------

type SectionRowsProps = {
  section: RowSection
  rows: CardTemplate['upfront']
  title: string
  containerCls: string
  titleCls: string
  emptyMsg: React.ReactNode
  template: CardTemplate
  setTemplate: (t: CardTemplate) => void
}

function SectionRows({
  section,
  rows,
  title,
  containerCls,
  titleCls,
  emptyMsg,
  template,
  setTemplate,
}: SectionRowsProps) {
  const sectionLabel = section === 'upfront' ? 'Show upfront' : 'When expanded'
  return (
    <div className={containerCls}>
      <div className={titleCls}>{title}</div>
      {rows.map((row, rowIdx) => {
        const stableKey = row.fields.map(f => f.key).join('-')
        return (
          <div
            key={stableKey}
            className="bg-card border border-line overflow-hidden"
          >
            {/* Row header with move controls */}
            <div className="flex items-center justify-between px-2 py-1 bg-surface border-b border-line">
              <span className="font-display uppercase tracking-[0.1em] text-[9px] font-medium text-muted">
                Row {rowIdx + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move row ${rowIdx + 1} up in ${sectionLabel}`}
                  disabled={rowIdx === 0}
                  onClick={() => setTemplate(moveRow(template, section, rowIdx, 'up'))}
                  className="touch-manipulation text-muted disabled:opacity-30 active:text-ink text-xs px-1"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move row ${rowIdx + 1} down in ${sectionLabel}`}
                  disabled={rowIdx === rows.length - 1}
                  onClick={() => setTemplate(moveRow(template, section, rowIdx, 'down'))}
                  className="touch-manipulation text-muted disabled:opacity-30 active:text-ink text-xs px-1"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Merge row ${rowIdx + 1} up with previous row in ${sectionLabel}`}
                  disabled={rowIdx === 0}
                  onClick={() => setTemplate(mergeRowUp(template, section, rowIdx))}
                  className="touch-manipulation text-[10px] font-medium text-muted disabled:opacity-30 active:text-ink px-1"
                >
                  ⤒ Merge up
                </button>
              </div>
            </div>
            {/* Chips */}
            <div className="flex flex-wrap gap-1.5 p-2">
              {row.fields.map(({ key, align }) => (
                <FieldChip
                  key={key}
                  fieldKey={key}
                  align={align}
                  currentSection={section}
                  onMove={dest => setTemplate(moveToField(template, key, dest))}
                  onAlign={a => setTemplate(setAlign(template, key, a))}
                  onSplit={() => setTemplate(splitToNewRow(template, key))}
                  chipColor={section}
                />
              ))}
            </div>
          </div>
        )
      })}
      {rows.length === 0 && emptyMsg}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type FieldChipProps = {
  fieldKey: CardFieldKey
  align: 'left' | 'right'
  currentSection: RowSection
  onMove: (dest: 'upfront' | 'expanded' | 'hidden') => void
  onAlign: (align: 'left' | 'right') => void
  onSplit: () => void
  chipColor: 'upfront' | 'expanded'
}

function FieldChip({ fieldKey, align, currentSection, onMove, onAlign, onSplit, chipColor }: FieldChipProps) {
  const label = CARD_FIELD_LABELS[fieldKey]

  return (
    <div className="inline-flex flex-col gap-0.5 border border-line bg-surface px-2 py-1">
      {/* Label row */}
      <span className="font-display text-[11px] font-medium text-ink whitespace-nowrap">{label}</span>
      {/* Controls row */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {/* Section move buttons — omit current section */}
        {currentSection !== 'upfront' && (
          <button
            type="button"
            aria-label={`Move ${label} to Show upfront`}
            onClick={() => onMove('upfront')}
            className="touch-manipulation text-[9px] font-medium border border-line text-muted active:bg-surface px-1 py-0.5"
          >
            ● up
          </button>
        )}
        {currentSection !== 'expanded' && (
          <button
            type="button"
            aria-label={`Move ${label} to When expanded`}
            onClick={() => onMove('expanded')}
            className="touch-manipulation text-[9px] font-medium border border-line text-muted active:bg-surface px-1 py-0.5"
          >
            ◐ exp
          </button>
        )}
        <button
          type="button"
          aria-label={`Move ${label} to hidden`}
          onClick={() => onMove('hidden')}
          className="touch-manipulation text-[9px] font-medium border border-line text-muted active:bg-surface px-1 py-0.5"
        >
          ○ hide
        </button>
        {/* Align */}
        <button
          type="button"
          aria-label={`Align ${label} left`}
          aria-pressed={align === 'left'}
          onClick={() => onAlign('left')}
          className={`touch-manipulation text-[9px] font-medium border border-line px-1 py-0.5 ${align === 'left' ? 'bg-ink text-white' : 'text-muted active:bg-surface'}`}
        >
          ←L
        </button>
        <button
          type="button"
          aria-label={`Align ${label} right`}
          aria-pressed={align === 'right'}
          onClick={() => onAlign('right')}
          className={`touch-manipulation text-[9px] font-medium border border-line px-1 py-0.5 ${align === 'right' ? 'bg-ink text-white' : 'text-muted active:bg-surface'}`}
        >
          R→
        </button>
        {/* Split */}
        <button
          type="button"
          aria-label={`Split ${label} to its own row`}
          onClick={() => onSplit()}
          className="touch-manipulation text-[9px] font-medium border border-line text-muted active:bg-surface px-1 py-0.5"
        >
          ⬡ split
        </button>
      </div>
    </div>
  )
}

type HiddenChipProps = {
  fieldKey: CardFieldKey
  onMove: (dest: 'upfront' | 'expanded') => void
}

function HiddenChip({ fieldKey, onMove }: HiddenChipProps) {
  const label = CARD_FIELD_LABELS[fieldKey]
  return (
    <div className="inline-flex flex-col gap-0.5 border border-line bg-surface px-2 py-1">
      <span className="font-display text-[11px] font-medium text-muted whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={`Move ${label} to Show upfront`}
          onClick={() => onMove('upfront')}
          className="touch-manipulation text-[9px] font-medium border border-line text-muted active:bg-surface px-1 py-0.5"
        >
          ● up
        </button>
        <button
          type="button"
          aria-label={`Move ${label} to When expanded`}
          onClick={() => onMove('expanded')}
          className="touch-manipulation text-[9px] font-medium border border-line text-muted active:bg-surface px-1 py-0.5"
        >
          ◐ exp
        </button>
      </div>
    </div>
  )
}
