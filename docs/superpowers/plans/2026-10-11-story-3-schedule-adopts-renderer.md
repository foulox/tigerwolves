# Card Layout — Story 3: Schedule Adopts the Shared Renderer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Schedule screen's workout cards render their body through the shared `WorkoutCardBody` (from 2a), driven by the run's `card_template` — so Schedule honors the run's card layout, exactly like Library. The Schedule-specific frame (card wrapper, name, vote badge, last-ran glance, selection control, "Currently planned"/week headers) stays.

**Architecture:** Pure wiring — no new logic, no component. At each of the three workout-body render sites in `components/ScheduleClient.tsx`, replace the inline `rawInput`/`coachingNotes`/`distTime` body + the separate "Show details" button + `<WorkoutDetails>` with a single `<WorkoutCardBody workout={w} layout={runConfig.cardTemplate} expanded={…} onToggle={…} />`. `runConfig.cardTemplate` is already a prop in scope.

**Tech Stack:** TypeScript, React. vitest (node env). **No new dependencies, no migration, no server action.** UI story — verified on Preview.

**Spec:** `docs/superpowers/specs/2026-10-10-configurable-card-layout-design.md`
**Builds on:** #501 (`WorkoutCardBody` `{workout, layout, expanded, onToggle}`, renders body + its own "Show details" toggle for the expanded rows).

## Decisions (confirmed with Lou, 2026-10-11)

1. **Schedule body shows the full layout** — the default layout surfaces distance stats, map link, and pills upfront (same as Library), replacing today's slimmer Schedule body. Intended: one layout drives every surface.
2. **Last-ran is layout-owned — removed from the Schedule header.** The header drops its "Last ran …/Never" glance; `lastRan` renders in the body per the layout (default: upfront), consistent with every surface, and the leader can hide it. No duplication. (Reversed from an earlier call — last-ran does NOT stay in the header.)
3. **"Show details" comes from `WorkoutCardBody`** (consistent everywhere); the frame's own toggle button is removed. The toggle now appears only when the resolved expanded section is non-empty (minor improvement over today's always-present button).

## Global Constraints

- `WorkoutCardBody` renders a toggle `<button>`, so it **must not** be nested inside the card's `handleSelect` `<button>` (invalid HTML). Place it as a sibling just below the select button, inside the card wrapper.
- Keep each site's frame: card wrapper + selection state styling, `w.name`, `VoteBadge`, `w.label`, the selection radio/button, family "N versions" + per-variant "Standard/Variation N" labels, "Currently planned"/week headers. **Remove** the last-ran span from the header (decision 2 — now layout-owned).
- Whose layout: the Schedule view is one run → `runConfig.cardTemplate` for every card (fallback null → default).

## Review Focus

- **Tapping a card still selects the workout** after the body moves out of the select button — the header remains the tap target. (Task 1, verified Task 2)
- **Last-ran** renders once — in the body via the layout (default: upfront) — and is gone from the header; it disappears entirely if the leader hides `lastRan`. (Task 1, verified Task 2)
- **A workout with no expanded-section content** → `WorkoutCardBody` shows no toggle (no empty "Show details"). (Task 2)
- **Family variant cards** (Site 3) still render each variant's body + selection radio correctly. (Task 1/2)
- **A run with a saved layout** (not default) → Schedule reflects it, matching Library for the same run. (Task 2)
- **`runConfig.cardTemplate` null** (unconfigured run / fallback config) → default layout renders, no crash. (Task 1)

---

### Task 1: Convert the three Schedule render sites to `WorkoutCardBody`

**Files:**
- Modify: `components/ScheduleClient.tsx`

**Interfaces:**
- Consumes: `WorkoutCardBody` (add `import WorkoutCardBody from '@/components/WorkoutCardBody'`).

- [ ] **Step 1: Add the import**

Add `import WorkoutCardBody from '@/components/WorkoutCardBody'` near the existing imports.

- [ ] **Step 2: Site 1 — "Currently planned" card (lines ~515–557)**

`w = plannedWorkout`, `eid = \`planned-${w.id}\``, `expanded = expandedId === eid`.
- Delete the body lines inside the select button (`w.rawInput` / `w.coachingNotes` / `w.distTime`, ~538–540).
- Delete the separate "Show details" button (~542–548) and the `{expanded && (<div…><WorkoutDetails w={w} /></div>)}` block (~549–552).
- After the closing `</button>` of the select button, inside the card wrapper `<div>`, add:
```tsx
<WorkoutCardBody
  workout={w}
  layout={runConfig.cardTemplate}
  expanded={expanded}
  onToggle={() => toggleExpand(eid)}
/>
```
- Keep the header (name / `VoteBadge` / last-ran / `w.label`) inside the select button unchanged.

- [ ] **Step 3: Site 2 — standalone picker card (lines ~694–735)**

`w = row.workout`, `eid = \`s-${w.id}\``. Same transformation as Step 2: strip body lines (~717–719), the toggle button (~721–727), and the `{expanded && …<WorkoutDetails w={w} />…}` (~728–731); add `<WorkoutCardBody workout={w} layout={runConfig.cardTemplate} expanded={expandedId === eid} onToggle={() => toggleExpand(eid)} />` as a sibling below the select button, inside the card wrapper.

- [ ] **Step 4: Site 3 — family variant card (lines ~752–786)**

Per variant `v`, `eid = \`f-variant-${v.id}\``. Strip the body lines (~775–777), the toggle button (~779–782), and the `{expanded && …<WorkoutDetails w={v} />…}` (~783); add `<WorkoutCardBody workout={v} layout={runConfig.cardTemplate} expanded={expandedId === eid} onToggle={() => toggleExpand(eid)} />` as a sibling below that variant's select button, inside the per-variant wrapper. Keep the radio circle + "Standard/Variation N" label + name + vote + last-ran frame.

- [ ] **Step 5: Remove last-ran from the three headers + drop unused imports**

At each site's header (the right-side group next to `VoteBadge`), remove the last-ran span `{w.lastRan ? formatDateShort(new Date(w.lastRan + 'T00:00:00')) : 'Never'}` (Site 1 ~523, Site 2 ~712, Site 3 ~770) — last-ran now renders in the body via the layout (decision 2). Then drop any import left unused: `WorkoutDetails` (line ~15), and `formatDateShort` if nothing else references it — grep each to confirm before removing. Do **not** delete `components/WorkoutDetails.tsx` — still used by `MyPlanCard.tsx`, `GroupRunCard.tsx`, and `WorkoutCardBody.tsx` (imports `PHASE_COLORS`/`DetailRow` from it).

- [ ] **Step 6: Typecheck + unit suite + commit**

Run: `npx tsc --noEmit` → clean. Run: `npm run test:unit` → green (unchanged).
```bash
git add components/ScheduleClient.tsx
git commit -m "feat(#502): Schedule renders workout body via WorkoutCardBody (run layout)"
```

---

### Task 2: Verify on Preview

- [ ] **Step 1: Live verification on the Preview URL**

Signed in as the test leader, Schedule screen:
1. The "Currently planned" card body now renders via the layout (default: distance stats, map link, pills upfront), with "Show details" revealing the expanded rows. Last-ran still shows in the header.
2. **Selecting** still works — tapping the card header selects the workout (selection ring/state updates).
3. Open the workout picker: standalone cards (Site 2) and family variant cards (Site 3) render the same way; variant selection radios still work.
4. A workout with no expanded content shows **no** "Show details" toggle.
5. If a run with a **saved** (non-default) layout is available (or set one via the Card layout tab first), confirm Schedule matches that layout and matches the same run's Library cards.
Capture before/after screenshots of the Schedule card in the PR.

- [ ] **Step 2: Migration?** None. No server action, no schema change.

---

## Self-Review

**1. Spec coverage (Story 3):** Schedule adopts the shared renderer driven by the run's layout (Task 1) ✓; frame preserved incl. last-ran per decision 2 (Task 1) ✓; verified live incl. selection still working (Task 2) ✓. This is the "Schedule" leg of decision B (all surfaces honor the layout).

**2. Placeholder scan:** No vague steps. Each site's exact edit references concrete line ranges and the committed `WorkoutCardBody` interface. No new logic to leave as TODO.

**3. Type consistency:** `WorkoutCardBody` receives `workout: WorkoutVariantRow` at all three sites (`plannedWorkout`, `row.workout`, `row.variants[i]` are all `WorkoutVariantRow` per the ScheduleClient types) and `layout={runConfig.cardTemplate}` (`CardTemplate | null`), matching #501's signature. `expanded`/`onToggle` reuse the existing `expandedId`/`toggleExpand(eid)` mechanism unchanged.

**4. Review Focus:** tap-to-select after restructure, empty-expanded no-toggle, family-variant rendering, saved-layout parity with Library, and null-layout default each map to a Task-1 edit constraint and a Task-2 verification step. Section non-empty.
