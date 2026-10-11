'use client'

import { Fragment } from 'react'
import { resolveCardLayout } from '@/lib/cardLayout'
import type { ResolvedRow, ResolvedField } from '@/lib/cardLayout'
import { describeField } from '@/lib/cardFields'
import type { FieldContent } from '@/lib/cardFields'
import { PHASE_COLORS, DetailRow } from '@/components/WorkoutDetails'
import type { WorkoutVariantRow, CardTemplate } from '@/lib/data'

type Props = {
  workout: WorkoutVariantRow
  layout: CardTemplate | null
  expanded: boolean
  onToggle: () => void
}

// Gather all 'inline' and 'text-inline' descriptors from a list of resolved
// fields in a row group and render them as a single ·-joined stats line.
function renderInlineGroup(descriptors: Array<{ field: ResolvedField; content: FieldContent }>) {
  const inlineParts: string[] = []
  for (const { content } of descriptors) {
    if (content.kind === 'inline') {
      inlineParts.push(...content.parts)
    } else if (content.kind === 'text-inline') {
      inlineParts.push(content.text)
    }
  }
  if (inlineParts.length === 0) return null
  return (
    <div className="flex gap-3 text-xs text-muted">
      {inlineParts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span>·</span>}
          <span>{p}</span>
        </Fragment>
      ))}
    </div>
  )
}

function renderFieldContent(
  workout: WorkoutVariantRow,
  content: FieldContent,
  key: string,
): React.ReactNode {
  switch (content.kind) {
    case 'text':
      if (content.variant === 'body') {
        return (
          <p key={key} className="text-sm text-ink whitespace-pre-wrap leading-snug">
            {content.text}
          </p>
        )
      }
      // coaching
      return (
        <p key={key} className="text-sm text-muted italic leading-snug">
          {content.text}
        </p>
      )

    case 'link':
      return (
        <a
          key={key}
          href={content.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-xs font-semibold text-accent touch-manipulation block"
        >
          {content.label}
        </a>
      )

    case 'image':
      return (
        <a
          key={key}
          href={workout.mapLink ?? content.src}
          target="_blank"
          rel="noopener noreferrer"
          className="block touch-manipulation"
        >
          <img
            src={content.src}
            alt="Route map"
            loading="lazy"
            className="w-full max-h-56 object-contain rounded-lg border border-line bg-surface"
          />
        </a>
      )

    case 'author':
      return (
        <p key={key} className="text-xs text-muted italic">— {content.text}</p>
      )

    case 'detail':
      return (
        <DetailRow key={key} label={content.label} value={content.value} />
      )

    case 'route':
      return (
        <div key={key}>
          <div className="font-semibold text-ink mb-1">Route directions</div>
          <p className="text-muted whitespace-pre-line">{content.text}</p>
        </div>
      )

    // inline and text-inline are handled in bulk by renderInlineGroup; this
    // branch is a fallback and should not be reached in normal usage.
    case 'inline':
    case 'text-inline':
      return null

    // pills are handled in renderGroupSide (merged into a single wrapper)
    case 'pills':
      return null
  }
}

// Render one side of a row (left or right group of resolved fields).
// - All inline/text-inline fields are merged into one ·-joined stats line.
// - All pills fields (race + phase) sharing the same side are merged into one
//   flex wrapper, matching the former WorkoutMeta pills row (removed in #506).
// - All other fields are stacked individually.
function renderGroupSide(
  workout: WorkoutVariantRow,
  fields: ResolvedField[],
): React.ReactNode {
  if (fields.length === 0) return null

  const described = fields
    .map(f => ({ field: f, content: describeField(workout, f.key) }))
    .filter((x): x is { field: ResolvedField; content: FieldContent } => x.content !== null)

  const inlineItems = described.filter(
    x => x.content.kind === 'inline' || x.content.kind === 'text-inline',
  )
  const pillsItems = described.filter(x => x.content.kind === 'pills')
  const otherItems = described.filter(
    x =>
      x.content.kind !== 'inline' &&
      x.content.kind !== 'text-inline' &&
      x.content.kind !== 'pills',
  )

  const nodes: React.ReactNode[] = []

  // Merged stats line (inline + text-inline together)
  if (inlineItems.length > 0) {
    nodes.push(
      <Fragment key="__inline">{renderInlineGroup(inlineItems)}</Fragment>,
    )
  }

  // Merged pills wrapper (race + phase in one flex row),
  // matching the former WorkoutMeta pills row (removed in #506).
  if (pillsItems.length > 0) {
    const pillNodes: React.ReactNode[] = []
    for (const { field, content } of pillsItems) {
      if (content.kind !== 'pills') continue
      if (content.variant === 'race') {
        content.items.forEach(r =>
          pillNodes.push(
            <span
              key={`race-${r}`}
              className="text-xs font-medium bg-surface text-muted border border-line px-2 py-0.5 rounded-full"
            >
              {r}
            </span>,
          ),
        )
      } else {
        // phase
        content.items.forEach(p =>
          pillNodes.push(
            <span
              key={`phase-${p}`}
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${PHASE_COLORS[p] ?? 'bg-surface text-muted border border-line'}`}
            >
              {p}
            </span>,
          ),
        )
      }
      void field // used only for key derivation via items above
    }
    if (pillNodes.length > 0) {
      nodes.push(
        <div key="__pills" className="flex flex-wrap gap-1.5">
          {pillNodes}
        </div>,
      )
    }
  }

  // All remaining kinds (text, link, image, author, detail)
  for (const { field, content } of otherItems) {
    nodes.push(renderFieldContent(workout, content, field.key))
  }

  if (nodes.length === 0) return null
  return <>{nodes}</>
}

function renderRow(workout: WorkoutVariantRow, row: ResolvedRow, idx: number) {
  const leftNodes = renderGroupSide(workout, row.left)
  const rightNodes = renderGroupSide(workout, row.right)

  if (!leftNodes && !rightNodes) return null

  return (
    <div key={idx} className="flex justify-between items-start gap-2">
      <div>{leftNodes}</div>
      {rightNodes && <div>{rightNodes}</div>}
    </div>
  )
}

export default function WorkoutCardBody({ workout, layout, expanded, onToggle }: Props) {
  const resolved = resolveCardLayout(workout, layout)

  return (
    <div className="mt-2.5 space-y-2">
      {resolved.upfront.map((row, i) => renderRow(workout, row, i))}

      {resolved.expanded.length > 0 && (
        <div>
          <button
            onClick={e => {
              e.stopPropagation()
              onToggle()
            }}
            aria-expanded={expanded}
            className="text-xs font-semibold text-accent touch-manipulation"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <div className="mt-1 space-y-2">
              {resolved.expanded.map((row, i) => renderRow(workout, row, i))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
