'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import * as Sentry from '@sentry/nextjs'
import { savePostTemplate } from '@/app/run-config/actions'
import type { ScheduleEntry, RunConfig, WorkoutVariantRow } from '@/lib/data'
import { renderPostTemplate, defaultTemplate, POST_FIELDS } from '@/lib/postBuilder'
import {
  parseTemplate,
  serializeTokens,
  buildInsertMenu,
  domNodesToTokens,
  type TemplateToken,
  type WalkNode,
} from '@/lib/postTemplateTokens'
import { pickerRecordsForRun, type PickerRecord } from '@/lib/libraryPicker'
import { KIND_TO_NBR_CATEGORY } from '@/lib/runProfile'

type Props = {
  runConfig: RunConfig
  nextEntry: ScheduleEntry | null
  roster: string[]
  variants: WorkoutVariantRow[]
}

// Preview against an empty schedule entry so date/day_leader emit nothing
// (Task 3 made {{date}} empty-safe). The picked library record supplies the
// workout content; the schedule entry only carries date/leader/type, which a
// bare template preview intentionally leaves blank.
const EMPTY_ENTRY: ScheduleEntry = {
  date: '',
  weekOfMonth: 0,
  workoutType: '' as ScheduleEntry['workoutType'],
  leader: '',
  workoutName: null,
  selectedVariations: [],
}

const VALID_KEYS = new Set(POST_FIELDS.map(f => f.key))
const FIELD_LABEL = new Map(POST_FIELDS.map(f => [f.key, f.label]))
const INSERT_MENU = buildInsertMenu(POST_FIELDS)

export default function PostTemplateTab({ runConfig, nextEntry, roster, variants }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)

  // Ordered token model — source of truth for Save/Generate.
  const [tokens, setTokens] = useState<TemplateToken[]>(() =>
    parseTemplate(runConfig.postTemplate ?? defaultTemplate(runConfig), VALID_KEYS),
  )

  const [insertOpen, setInsertOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<PickerRecord | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const records = pickerRecordsForRun(variants, runConfig)
  const category = KIND_TO_NBR_CATEGORY[runConfig.kind] ?? runConfig.kind

  // -------------------------------------------------------------------------
  // Editor DOM ↔ token model
  // -------------------------------------------------------------------------

  // Seed the contenteditable from the initial token model exactly once. After
  // mount the DOM is authoritative for text (React must not re-render into it),
  // and re-derived into `tokens` on every input. Only chip insert/remove mutate
  // the DOM imperatively.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = ''
    for (const tok of tokens) {
      if (tok.type === 'text') {
        el.appendChild(document.createTextNode(tok.value))
      } else {
        el.appendChild(makeChip(tok.key))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build an atomic, non-editable chip element. The ✕ removes only this chip.
  function makeChip(key: string): HTMLSpanElement {
    const span = document.createElement('span')
    span.className =
      'chip inline-flex items-center gap-1 align-baseline bg-surface text-ink ' +
      'border border-line pl-2 pr-1 py-0.5 text-xs font-bold whitespace-nowrap ' +
      'select-none touch-manipulation'
    span.setAttribute('contenteditable', 'false')
    span.setAttribute('data-key', key)

    const label = document.createElement('span')
    label.textContent = FIELD_LABEL.get(key) ?? key

    const x = document.createElement('button')
    x.type = 'button'
    x.textContent = '✕'
    x.className =
      'x inline-flex items-center justify-center w-4 h-4 bg-ink/10 ' +
      'text-[10px] leading-none touch-manipulation'
    x.setAttribute('aria-label', `Remove ${FIELD_LABEL.get(key) ?? key} field`)
    x.addEventListener('mousedown', ev => {
      // mousedown (not click) so the caret/selection isn't stolen first.
      ev.preventDefault()
      ev.stopPropagation()
      span.remove()
      syncTokens()
    })

    span.appendChild(label)
    span.appendChild(x)
    return span
  }

  // Re-derive the token model from the live editor DOM. The walk itself is pure
  // and DOM-agnostic in lib/postTemplateTokens (domNodesToTokens) so it can be
  // unit-tested without a real DOM — here we just hand it the editor's child
  // nodes. Falls back to the current token state when the ref isn't mounted.
  function readTokens(): TemplateToken[] {
    const el = editorRef.current
    if (!el) return tokens
    return domNodesToTokens(el.childNodes as unknown as ArrayLike<WalkNode>)
  }

  function syncTokens() {
    setTokens(readTokens())
    // Any edit invalidates the last generated preview until Generate is tapped.
    setPreview(null)
    setSaved(false)
  }

  // -------------------------------------------------------------------------
  // Caret tracking so Insert drops the chip where the cursor is
  // -------------------------------------------------------------------------
  function saveSelection() {
    const sel = window.getSelection()
    const el = editorRef.current
    if (sel && sel.rangeCount && el && el.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  function insertChipAtCaret(key: string) {
    const el = editorRef.current
    if (!el) return
    const chip = makeChip(key)
    const range = savedRangeRef.current

    if (range && el.contains(range.commonAncestorContainer)) {
      range.deleteContents()
      range.insertNode(chip)
      range.setStartAfter(chip)
      range.setEndAfter(chip)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      savedRangeRef.current = range.cloneRange()
    } else {
      // No known caret inside the editor — append at the end.
      el.appendChild(chip)
    }
    el.focus()
    syncTokens()
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  function handleGenerate() {
    if (!picked) return
    const result = renderPostTemplate(
      serializeTokens(readTokens()),
      nextEntry ?? EMPTY_ENTRY,
      picked.variants,
      runConfig,
      roster,
      picked.type,
    )
    setPreview(result)
  }

  function handleSave() {
    const template = serializeTokens(readTokens())
    startTransition(async () => {
      try {
        const result = await savePostTemplate(runConfig.id, { postTemplate: template })
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

  // Close popovers on outside interaction.
  useEffect(() => {
    if (!insertOpen && !pickerOpen) return
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest('[data-insert-menu]')) setInsertOpen(false)
      if (!t.closest('[data-picker-menu]')) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [insertOpen, pickerOpen])

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Editor card */}
      <div className="bg-card border border-line p-4 flex flex-col gap-3">
        <div className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted">
          Template <span className="normal-case text-muted">— type freely, ✕ a chip to remove</span>
        </div>

        <div
          ref={editorRef}
          role="textbox"
          aria-label="Post template editor"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onInput={syncTokens}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          className="border border-line px-3 py-2.5 text-sm text-ink bg-card whitespace-pre-wrap outline-none min-h-[220px] leading-loose focus:border-ink touch-manipulation"
        />

        {/* Insert field menu */}
        <div className="relative" data-insert-menu>
          <button
            type="button"
            onMouseDown={e => {
              // Preserve the editor caret before the button steals focus.
              e.preventDefault()
              saveSelection()
            }}
            onClick={() => setInsertOpen(o => !o)}
            className="inline-flex items-center gap-1.5 border border-ink text-ink rounded-none font-display uppercase tracking-[0.1em] text-[11px] font-medium px-3 py-2 touch-manipulation"
          >
            ＋ Insert field ▾
          </button>
          {insertOpen && (
            <div className="absolute z-20 left-0 top-full mt-1.5 min-w-[220px] bg-card border border-line shadow-lg overflow-hidden">
              {INSERT_MENU.map(group => (
                <div key={group.source}>
                  <div className="px-3 pt-2 pb-1 font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted bg-surface">
                    {group.source}
                  </div>
                  {group.fields.map(field => (
                    <button
                      key={field.key}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setInsertOpen(false)
                        insertChipAtCaret(field.key)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left border-t border-line first:border-t-0 active:bg-surface touch-manipulation"
                    >
                      {field.affix && <span>{field.affix}</span>}
                      <span>{field.label}</span>
                      <span className="ml-auto text-[10px] font-medium text-muted">{field.source}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="bg-ink text-white py-3 font-display uppercase tracking-[0.1em] text-[11px] font-medium disabled:opacity-50 touch-manipulation"
        >
          {saved ? 'Saved!' : isPending ? 'Saving…' : 'Save template'}
        </button>
      </div>

      {/* Preview-with band */}
      <div className="bg-surface border border-dashed border-line p-3 flex flex-col gap-2">
        <div className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-ink">
          Preview with…
        </div>
        <div className="relative" data-picker-menu>
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="w-full flex items-center justify-between border border-line bg-card px-3 py-2.5 text-sm text-ink touch-manipulation"
          >
            <span className={picked ? '' : 'text-muted'}>
              {picked ? picked.name : `Choose from ${category}…`}
            </span>
            <span>▾</span>
          </button>
          {pickerOpen && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1.5 bg-card border border-line shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              <div className="px-3 py-2 font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted bg-surface sticky top-0">
                📚 Library · {category}
              </div>
              {records.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted">No records in this library.</div>
              ) : (
                records.map(rec => (
                  <button
                    key={rec.familyId}
                    type="button"
                    onClick={() => {
                      setPicked(rec)
                      setPickerOpen(false)
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-left border-t border-line active:bg-surface touch-manipulation"
                  >
                    <span>{rec.name}</span>
                    <span className="text-muted text-xs whitespace-nowrap">{rec.subtitle}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!picked}
          className="w-full bg-ink text-white py-2.5 font-display uppercase tracking-[0.1em] text-[11px] font-medium disabled:opacity-40 touch-manipulation"
        >
          Generate preview
        </button>
      </div>

      {/* Live preview */}
      <div className="flex flex-col gap-2">
        <div className="font-display uppercase tracking-[0.1em] text-[10px] font-medium text-muted">Live preview</div>
        {preview === null ? (
          <div className="bg-card border border-line px-4 py-5 text-center text-sm text-muted">
            Pick a record and tap <b>Generate preview</b> to see the resolved post.
          </div>
        ) : (
          <div className="bg-card border border-line p-4 text-sm text-ink whitespace-pre-wrap">
            {preview}
          </div>
        )}
      </div>
    </div>
  )
}
