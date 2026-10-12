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
        containerCls="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-col gap-2"
        titleCls="text-[10.5px] font-extrabold uppercase tracking-wide text-emerald-700"
        emptyMsg={<p className="text-xs text-emerald-500 italic px-1">No fields — move one here from another section.</p>}
        template={template}
        setTemplate={setTemplate}
      />

      <SectionRows
        section="expanded"
        rows={template.expanded}
        title="◐ When expanded"
        containerCls="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-col gap-2"
        titleCls="text-[10.5px] font-extrabold uppercase tracking-wide text-blue-700"
        emptyMsg={<p className="text-xs text-blue-400 italic px-1">No fields — move one here from another section.</p>}
        template={template}
        setTemplate={setTemplate}
      />

      {/* Hidden section */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-2">
        <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-gray-500">
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
            <p className="text-xs text-gray-400 italic">All fields are shown in a section above.</p>
          )}
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-400 text-center">
        Changes show on your Library cards after you Save.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="bg-orange-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 touch-manipulation"
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
            className="bg-white border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* Row header with move controls */}
            <div className="flex items-center justify-between px-2 py-1 bg-gray-50 border-b border-gray-100">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                Row {rowIdx + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Move row ${rowIdx + 1} up in ${sectionLabel}`}
                  disabled={rowIdx === 0}
                  onClick={() => setTemplate(moveRow(template, section, rowIdx, 'up'))}
                  className="touch-manipulation text-gray-400 disabled:opacity-30 hover:text-gray-700 text-xs px-1"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move row ${rowIdx + 1} down in ${sectionLabel}`}
                  disabled={rowIdx === rows.length - 1}
                  onClick={() => setTemplate(moveRow(template, section, rowIdx, 'down'))}
                  className="touch-manipulation text-gray-400 disabled:opacity-30 hover:text-gray-700 text-xs px-1"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Merge row ${rowIdx + 1} up with previous row in ${sectionLabel}`}
                  disabled={rowIdx === 0}
                  onClick={() => setTemplate(mergeRowUp(template, section, rowIdx))}
                  className="touch-manipulation text-[10px] font-bold text-gray-400 disabled:opacity-30 hover:text-gray-700 px-1"
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
  const chipCls =
    chipColor === 'upfront'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : 'bg-blue-50 border-blue-200 text-blue-800'

  return (
    <div className={`inline-flex flex-col gap-0.5 border rounded-lg px-2 py-1 ${chipCls}`}>
      {/* Label row */}
      <span className="text-[11.5px] font-semibold whitespace-nowrap">{label}</span>
      {/* Controls row */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {/* Section move buttons — omit current section */}
        {currentSection !== 'upfront' && (
          <button
            type="button"
            aria-label={`Move ${label} to Show upfront`}
            onClick={() => onMove('upfront')}
            className="touch-manipulation text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded px-1 py-0.5 hover:bg-emerald-200"
          >
            ● up
          </button>
        )}
        {currentSection !== 'expanded' && (
          <button
            type="button"
            aria-label={`Move ${label} to When expanded`}
            onClick={() => onMove('expanded')}
            className="touch-manipulation text-[9px] font-bold bg-blue-100 text-blue-700 rounded px-1 py-0.5 hover:bg-blue-200"
          >
            ◐ exp
          </button>
        )}
        <button
          type="button"
          aria-label={`Move ${label} to hidden`}
          onClick={() => onMove('hidden')}
          className="touch-manipulation text-[9px] font-bold bg-gray-100 text-gray-600 rounded px-1 py-0.5 hover:bg-gray-200"
        >
          ○ hide
        </button>
        {/* Align */}
        <button
          type="button"
          aria-label={`Align ${label} left`}
          aria-pressed={align === 'left'}
          onClick={() => onAlign('left')}
          className={`touch-manipulation text-[9px] font-bold rounded px-1 py-0.5 ${align === 'left' ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          ←L
        </button>
        <button
          type="button"
          aria-label={`Align ${label} right`}
          aria-pressed={align === 'right'}
          onClick={() => onAlign('right')}
          className={`touch-manipulation text-[9px] font-bold rounded px-1 py-0.5 ${align === 'right' ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          R→
        </button>
        {/* Split */}
        <button
          type="button"
          aria-label={`Split ${label} to its own row`}
          onClick={() => onSplit()}
          className="touch-manipulation text-[9px] font-bold bg-gray-100 text-gray-600 rounded px-1 py-0.5 hover:bg-gray-200"
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
    <div className="inline-flex flex-col gap-0.5 bg-white border border-gray-200 rounded-lg px-2 py-1">
      <span className="text-[11.5px] font-semibold text-gray-600 whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={`Move ${label} to Show upfront`}
          onClick={() => onMove('upfront')}
          className="touch-manipulation text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded px-1 py-0.5 hover:bg-emerald-200"
        >
          ● up
        </button>
        <button
          type="button"
          aria-label={`Move ${label} to When expanded`}
          onClick={() => onMove('expanded')}
          className="touch-manipulation text-[9px] font-bold bg-blue-100 text-blue-700 rounded px-1 py-0.5 hover:bg-blue-200"
        >
          ◐ exp
        </button>
      </div>
    </div>
  )
}
