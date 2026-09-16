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
  type TemplateToken,
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
      'chip inline-flex items-center gap-1 align-baseline bg-orange-100 text-orange-700 ' +
      'border border-orange-200 rounded-md pl-2 pr-1 py-0.5 text-xs font-bold whitespace-nowrap ' +
      'select-none touch-manipulation'
    span.setAttribute('contenteditable', 'false')
    span.setAttribute('data-key', key)

    const label = document.createElement('span')
    label.textContent = FIELD_LABEL.get(key) ?? key

    const x = document.createElement('button')
    x.type = 'button'
    x.textContent = '✕'
    x.className =
      'x inline-flex items-center justify-center w-4 h-4 rounded-full bg-black/10 ' +
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

  // Walk the editor's DOM in order and re-derive the token model. Recursive so
  // that block-level line wrappers (a <div>/<p> the browser inserts when Enter
  // is pressed — the default in Chrome and mobile Safari) contribute the '\n'
  // their boundary represents, instead of being flattened to their bare text.
  //
  //   - text node        → verbatim text token
  //   - <br>             → '\n' (an explicit soft line break)
  //   - chip (data-key)  → chip token; NOT descended into, so the ✕ glyph never
  //                        leaks into the serialized template
  //   - block DIV/P      → a '\n' boundary before its contents (unless it's the
  //                        very first content), then recurse into its children
  //   - other element    → recurse (spans, etc. carry no boundary of their own)
  //
  // Adjacent text is merged and empty-string text tokens are suppressed, exactly
  // as serializeTokens/parseTemplate round-trip expects.
  function readTokens(): TemplateToken[] {
    const el = editorRef.current
    if (!el) return tokens

    const raw: TemplateToken[] = []

    // True once any real content (text/chip/newline) has been emitted, so the
    // first block wrapper doesn't prepend a spurious leading newline.
    let hasContent = false

    const pushText = (value: string) => {
      if (value === '') return
      raw.push({ type: 'text', value })
      hasContent = true
    }
    const pushNewline = () => {
      raw.push({ type: 'text', value: '\n' })
      hasContent = true
    }
    const pushChip = (key: string) => {
      raw.push({ type: 'chip', key })
      hasContent = true
    }

    // Did the last thing we emitted end in a newline? Guards the block-boundary
    // newline against doubling when the previous line already closed with one.
    const lastEndsInNewline = () => {
      const last = raw[raw.length - 1]
      return !!last && last.type === 'text' && last.value.endsWith('\n')
    }

    const isBlock = (node: Node): node is HTMLElement =>
      node instanceof HTMLElement &&
      (node.nodeName === 'DIV' || node.nodeName === 'P') &&
      !(node as HTMLElement).dataset.key

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        pushText(node.textContent ?? '')
        return
      }
      // A <br> ALWAYS emits a newline — whether it's a soft break inside a line
      // or the filler the browser puts in an otherwise-empty line
      // (`<div><br></div>`). Doubling against a following block's own boundary is
      // prevented by the lastEndsInNewline() guard on the block branch below: a
      // `<br>` then a <div> collapses to one '\n', while an empty
      // `<div><br></div>` between two blocks correctly yields a blank line
      // ('\n\n'). (Suppressing the filler <br> instead silently dropped those
      // blank separator lines, collapsing the spacing between template sections.)
      if (node.nodeName === 'BR') {
        pushNewline()
        return
      }
      if (node instanceof HTMLElement && node.dataset.key) {
        pushChip(node.dataset.key)
        return
      }
      if (isBlock(node)) {
        // Block boundary = one newline before its contents, except at the very
        // start, and never doubling an existing trailing newline.
        if (hasContent && !lastEndsInNewline()) pushNewline()
        node.childNodes.forEach(walk)
        return
      }
      if (node instanceof HTMLElement) {
        // Inline wrapper (e.g. a <span> from styling): descend, no boundary.
        node.childNodes.forEach(walk)
      }
    }

    el.childNodes.forEach(walk)

    // Merge adjacent text tokens into one, dropping empties — the shape
    // serializeTokens/parseTemplate round-trips through.
    const out: TemplateToken[] = []
    for (const tok of raw) {
      if (tok.type === 'text') {
        if (tok.value === '') continue
        const prev = out[out.length - 1]
        if (prev && prev.type === 'text') {
          prev.value += tok.value
          continue
        }
      }
      out.push(tok)
    }
    return out
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
      <div className="bg-white rounded-xl p-4 flex flex-col gap-3 shadow-sm">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
          Template <span className="normal-case font-semibold text-gray-300">— type freely, ✕ a chip to remove</span>
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
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-gray-50 whitespace-pre-wrap outline-none min-h-[220px] leading-loose focus:bg-white focus:border-orange-200 touch-manipulation"
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
            className="inline-flex items-center gap-1.5 border border-orange-600 text-orange-600 font-bold text-sm rounded-lg px-3 py-2 touch-manipulation"
          >
            ＋ Insert field ▾
          </button>
          {insertOpen && (
            <div className="absolute z-20 left-0 top-full mt-1.5 min-w-[220px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
              {INSERT_MENU.map(group => (
                <div key={group.source}>
                  <div className="px-3 pt-2 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50">
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
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left border-t border-gray-100 first:border-t-0 hover:bg-orange-50 touch-manipulation"
                    >
                      {field.affix && <span>{field.affix}</span>}
                      <span>{field.label}</span>
                      <span className="ml-auto text-[10px] font-bold text-gray-400">{field.source}</span>
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
          className="bg-orange-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50 touch-manipulation"
        >
          {saved ? 'Saved!' : isPending ? 'Saving…' : 'Save template'}
        </button>
      </div>

      {/* Preview-with band */}
      <div className="bg-orange-50 border border-dashed border-orange-200 rounded-xl p-3 flex flex-col gap-2">
        <div className="text-[11px] font-bold text-orange-700 uppercase tracking-wide">
          Preview with…
        </div>
        <div className="relative" data-picker-menu>
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            className="w-full flex items-center justify-between border border-gray-200 rounded-lg bg-white px-3 py-2.5 text-sm text-gray-900 touch-manipulation"
          >
            <span className={picked ? '' : 'text-gray-400'}>
              {picked ? picked.name : `Choose from ${category}…`}
            </span>
            <span>▾</span>
          </button>
          {pickerOpen && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50 sticky top-0">
                📚 Library · {category}
              </div>
              {records.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400">No records in this library.</div>
              ) : (
                records.map(rec => (
                  <button
                    key={rec.familyId}
                    type="button"
                    onClick={() => {
                      setPicked(rec)
                      setPickerOpen(false)
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-left border-t border-gray-100 hover:bg-orange-50 touch-manipulation"
                  >
                    <span>{rec.name}</span>
                    <span className="text-gray-400 text-xs whitespace-nowrap">{rec.subtitle}</span>
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
          className="w-full bg-orange-600 text-white rounded-lg py-2.5 font-bold text-sm disabled:opacity-40 touch-manipulation"
        >
          Generate preview
        </button>
      </div>

      {/* Live preview */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Live preview</div>
        {preview === null ? (
          <div className="bg-white rounded-xl px-4 py-5 text-center text-sm text-gray-400 shadow-sm">
            Pick a record and tap <b>Generate preview</b> to see the resolved post.
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4 text-sm text-gray-900 whitespace-pre-wrap shadow-sm">
            {preview}
          </div>
        )}
      </div>
    </div>
  )
}
