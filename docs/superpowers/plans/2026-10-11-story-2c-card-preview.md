# Card Layout — Story 2c: Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside the Card layout tab, show a **live preview** — a workout picklist plus **My Plan / Schedule / Library** surface tabs — that renders the picked workout through the shipped `WorkoutCardBody` using the editor's *in-progress* (unsaved) `CardTemplate`, so a leader sees changes update as they edit.

**Architecture:** A new presentational `CardLayoutPreview` component (picklist + surface tabs + three lightweight frame wrappers around `WorkoutCardBody`). It's driven entirely by props from `CardTemplateTab` — the live `template` state, the run's `variants`, and `nextEntry` for a realistic date. No new logic layer; the fields it shows already come from the 2a resolver inside `WorkoutCardBody`.

**Tech Stack:** TypeScript, React (Next.js App Router), vitest (node env — this is a UI story; verified on Preview, no component unit tests). **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-10-10-configurable-card-layout-design.md`
**Builds on:** #501 (`WorkoutCardBody` `{workout, layout, expanded, onToggle}`), #505 (`CardTemplateTab` holding `template`/`setTemplate` state). Patterns to mirror: the "Preview with…" dropdown in `components/PostTemplateTab.tsx:292-334`; `pickerRecordsForRun`/`PickerRecord` in `lib/libraryPicker.ts:4-30`. Frame markup to replicate: `components/MyPlanCard.tsx:54-115`, `components/ScheduleClient.tsx:522-554`, `components/LibraryClient.tsx:300-338`.

## Global Constraints

- **No new dependencies.** Preview is composed from existing components + markup.
- The preview renders from the **live, unsaved** `template` (the editor's state) — it updates on every edit, before Save. It does **not** read the saved DB value.
- `WorkoutCardBody` renders the card **body only**; each surface frame supplies that surface's header (run identity / date / workout name / type pill).
- The workout rendered is `picked.variants[0]` (the base/Standard variant — `pickerRecordsForRun` sorts variants Standard-first).
- `aria-label` on icon-only controls; `touch-manipulation` on interactive elements (repo guardrails).
- Column/data unchanged; **no migration**, no server action (preview is read-only client state).

## Review Focus

- **Run with an empty library** (`records.length === 0`) → the preview shows an empty-state message, not a crash. (Task 1)
- **Nothing picked yet** → default to the first record so the preview isn't blank on open; if there are no records, empty state. (Task 1)
- **A workout missing the fields a surface emphasizes** (e.g. no route image) → the body simply omits them (2a resolver skip); the frame still renders. (Task 1, inherited)
- **Switching surface tabs** keeps the same picked workout + same live `template` — only the frame changes. (Task 1)
- **Editing the layout while the preview is open** → the preview reflects it immediately (driven by the shared `template` state). (Task 2)

---

### Task 1: `CardLayoutPreview` component

**Files:**
- Create: `components/CardLayoutPreview.tsx`

**Interfaces:**
- Consumes: `WorkoutCardBody` (#501), `pickerRecordsForRun`/`PickerRecord` (lib/libraryPicker), `CardTemplate`/`WorkoutVariantRow`/`ScheduleEntry`/`RunConfig` (lib/data), the date formatter used by MyPlanCard (`formatDateMedium`).
- Produces: `<CardLayoutPreview template={CardTemplate} variants={WorkoutVariantRow[]} runConfig={RunConfig} nextEntry={ScheduleEntry | null} />`.

- [ ] **Step 1: Implement the component**

- `const records = pickerRecordsForRun(variants, runConfig)`.
- State: `const [pickedId, setPickedId] = useState<number | null>(records[0]?.familyId ?? null)`; derive `picked = records.find(r => r.familyId === pickedId) ?? records[0] ?? null`. State: `const [surface, setSurface] = useState<'myplan'|'schedule'|'library'>('myplan')`; `const [expanded, setExpanded] = useState(false)`.
- **Empty state:** if `records.length === 0`, render a muted "Add a workout to your library to preview your card layout." and return.
- **Picklist:** mirror the "Preview with…" dropdown markup from `PostTemplateTab.tsx:292-334` — a button showing `picked?.name`, a dropdown listing `records` (`rec.name` + `rec.subtitle`), selecting sets `pickedId`.
- **Surface tabs:** three buttons (My Plan / Schedule / Library) toggling `surface` (style per the mockup `docs/superpowers/plans/2026-10-10-story-1-card-layout-mockup.html`).
- **The workout:** `const w = picked ? picked.variants[0] : null` (guard null).
- **Frames** (render the one matching `surface`), each wrapping `<WorkoutCardBody workout={w} layout={template} expanded={expanded} onToggle={() => setExpanded(e => !e)} />`:
  - **My Plan** — replicate `MyPlanCard.tsx:54-115`'s header: `{runConfig.emoji} {runConfig.name} ›`, date via `formatDateMedium(nextEntry?.date)` (fallback to today's label if `nextEntry` null), workout name `w.name`, type pill `w.type`. Then the body.
  - **Schedule** — replicate `ScheduleClient.tsx:522-554`: "Currently planned" label, `w.name`, `w.label` if present, last-ran, then the body.
  - **Library** — replicate `LibraryClient.tsx:300-338`: `w.name` + type badge `w.type`, `w.label` if present, then the body.
  - Keep frames **lightweight** — identity + the body; omit per-screen chrome irrelevant to layout (reactions, adopt controls, vote badges).
- Caption: "Preview uses your unsaved changes. Save to apply to your run's cards."

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → clean. (No unit test — node-env vitest can't render React; verified on Preview in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add components/CardLayoutPreview.tsx
git commit -m "feat(#507): CardLayoutPreview — picklist + surface tabs + live card body"
```

---

### Task 2: Wire the preview into `CardTemplateTab` + thread props

**Files:**
- Modify: `components/CardTemplateTab.tsx` (add `variants` + `nextEntry` props; render `CardLayoutPreview` below the editor with the live `template`)
- Modify: `components/RunConfigClient.tsx` (pass `variants` + `nextEntry` to `CardTemplateTab` — it already receives both and passes them to `PostTemplateTab`)

**Interfaces:**
- Consumes: `CardLayoutPreview` (Task 1).

- [ ] **Step 1: Extend `CardTemplateTab` props + render the preview**

- Props: add `variants: WorkoutVariantRow[]` and `nextEntry: ScheduleEntry | null` to the `Props` type.
- Below the editor sections + Save button, render:
```tsx
<CardLayoutPreview template={template} variants={variants} runConfig={runConfig} nextEntry={nextEntry} />
```
(`template` is the existing live state at `CardTemplateTab.tsx:22` — editing updates the preview automatically.)

- [ ] **Step 2: Pass the props from `RunConfigClient`**

At the `<CardTemplateTab runConfig={runConfig} />` mount (`RunConfigClient.tsx:40`), add `variants={variants}` and `nextEntry={nextEntry}` (both already in `RunConfigClient`'s props, per `:10-14`).

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add components/CardTemplateTab.tsx components/RunConfigClient.tsx
git commit -m "feat(#507): mount live preview in Card layout tab"
```

---

### Task 3: Verify on Preview

- [ ] **Step 1: Suite + typecheck**

Run: `npm run test:unit` (unchanged — still green) and `npx tsc --noEmit`.

- [ ] **Step 2: Live verification on the Preview URL**

Signed in as the test leader, Run Settings → Card layout:
1. The preview shows below the editor, defaulting to a workout and the **My Plan** frame.
2. Swap the **workout** via the picklist → the preview re-renders that workout.
3. Switch **surface tabs** (My Plan / Schedule / Library) → the frame changes, same workout, same layout; My Plan shows run name + date.
4. **Edit the layout** (move a field, change alignment, merge a row) → the preview updates **live, before saving**.
5. Toggle the body's "Show details" → expanded rows appear.
6. Confirm a run with an empty library shows the empty-state message (or note it's not reproducible with seeded data).
Capture a screenshot of the preview across the three surface tabs in the PR.

- [ ] **Step 3: Migration?** None.

---

## Self-Review

**1. Spec coverage (2c slice):** workout picklist ✓ (Task 1); My Plan / Schedule / Library surface tabs rendering the live layout through the shared renderer ✓ (Task 1); wired to the editor's unsaved state ✓ (Task 2); verified live ✓ (Task 3). Completes the "preview all three surfaces (decision B)" from the spec.

**2. Placeholder scan:** No vague steps. All markup references exact shipped sources (picker + three frames) by file:line. The component is presentational with no new logic to leave as TODO.

**3. Type consistency:** `CardLayoutPreview` prop shape (Task 1) matches the mount in Task 2; `variants`/`nextEntry` types flow `RunConfigClient` → `CardTemplateTab` → `CardLayoutPreview` unchanged; `picked.variants[0]` is a `WorkoutVariantRow` as `WorkoutCardBody` requires.

**4. Review Focus:** empty library, nothing-picked default, missing-field skip (inherited from 2a), tab-switch stability, and live-edit reflection each map to a Task-1/Task-2 behavior and a Task-3 verification step. Section non-empty.
