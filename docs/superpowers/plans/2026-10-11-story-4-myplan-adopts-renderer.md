# Card Layout — Story 4: My Plan Adopts the Shared Renderer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make My Plan's card render its body through the shared `WorkoutCardBody` (2a), driven by **each card's own run's** layout — condensed shows the run's "Upfront" fields, "Show details" adds the "When-expanded" fields — completing "one layout, every surface." The My Plan frame (run header link, date, workout name, type pill, "Led by", reactions, flag) stays as chrome.

**Architecture:** Pure wiring in `components/MyPlanCard.tsx`. The per-run layout is already available — `item.run` is a full `RunConfig` from `getRunById` (which selects `card_template`), so `item.run.cardTemplate` is in hand with no pipeline change. Replace the bespoke condensed body + the expanded `DetailRow`/`WorkoutDetails` block with one `<WorkoutCardBody workout={workout} layout={item.run.cardTemplate} expanded={expanded} onToggle={toggleExpand} />`. Its own "Show details" button replaces whole-card-tap (uniform with Library/Schedule); `toggleExpand` keeps the `my_week_card_expanded` analytics.

**Tech Stack:** TypeScript, React. vitest (node env). **No new dependencies, no migration, no server action, no DB change.** UI story — verified on Preview.

**Spec:** `docs/superpowers/specs/2026-10-10-configurable-card-layout-design.md`
**Builds on:** #501 (`WorkoutCardBody` renders body + its own "Show details" toggle). Data already flows: `app/my-plan/page.tsx:54` → `getMyPlan` → `assembleMyPlan` (`lib/db.ts:866`) → `getRunById` per run (selects `card_template`, returns `cardTemplate`) → `MyPlanItem.run.cardTemplate`.

## Decisions (confirmed with Lou, 2026-10-11 — "uniformity over different views")

1. **Condensed My Plan card = the layout's Upfront rows** — replaces today's bespoke one-liner (`setLine` / route distance summary). Glanceability is controlled by what the leader puts Upfront.
2. **Expand via the shared "Show details" button** (uniform with Library/Schedule) — whole-card-tap-to-expand is removed. The run-name link still navigates to `/runs/{id}`. The `my_week_card_expanded` analytics event is preserved by wiring `onToggle={toggleExpand}`.
3. **Reactions, flag, and the "N variations" chip stay as My Plan chrome** (not layout-driven), rendered around the body.

## Global Constraints

- `WorkoutCardBody` renders a toggle `<button>` and must not nest inside another button — My Plan's card is a `<div>` (the run-name is its own `<Link>`), so place `WorkoutCardBody` directly in the card body.
- Each card uses **its own** run's layout: `layout={item.run.cardTemplate}` (never a single shared config — My Plan aggregates multiple runs).
- Preserve the `my_week_card_expanded` analytics with the same payload (`runId`, `workoutName`, `kind`).
- `data-testid={`my-plan-detail-${run.id}`}` on the expanded region is referenced by `__tests__/myPlan.test.ts` — keep a stable test hook (see Task 1 Step 5).

## Review Focus

- **Run-name link still navigates** to `/runs/{id}` after whole-card-tap is removed. (Task 1, verified Task 2)
- **`my_week_card_expanded` still fires** with the same payload on expand. (Task 1)
- **Per-run layout** — two followed runs with different `card_template`s render differently on the same My Plan feed. (Task 2)
- **`workout` is null** (a scheduled slot with no workout chosen) → no `WorkoutCardBody`, no crash; the existing "no workout" frame still shows. (Task 1)
- **Reactions/flag/variations** remain reachable (chrome), not lost in the swap. (Task 1, verified Task 2)

---

### Task 1: Convert `MyPlanCard` body to `WorkoutCardBody`

**Files:**
- Modify: `components/MyPlanCard.tsx`

**Interfaces:**
- Consumes: `WorkoutCardBody` (`import WorkoutCardBody from '@/components/WorkoutCardBody'`).

- [ ] **Step 1: Add the import; keep `expanded`/`toggleExpand`**

Add the `WorkoutCardBody` import. Keep `const [expanded, setExpanded] = useState(false)` (line 32) and `toggleExpand()` (lines 39–51) **including** the `captureClientEvent('my_week_card_expanded', …)` call — it's reused as `onToggle`.

- [ ] **Step 2: Remove whole-card-tap; keep navigation**

Remove the card-level expand affordance (the outer `onClick`/`aria-expanded`/role that made the whole card toggle, ~54–62). Leave the run-name `<Link>` (66–74) intact so it still navigates. The card wrapper becomes a plain `<div>`.

- [ ] **Step 3: Replace the condensed body with `WorkoutCardBody`**

Remove the bespoke condensed body — the Workout-kind `setLine` and the Route-kind distance + "View route ↗" block (~82–104). Keep the header: date + workout name (78–81) and the type pill (106–113). Below the header, render (only when there's a workout):
```tsx
{workout && (
  <WorkoutCardBody
    workout={workout}
    layout={item.run.cardTemplate}
    expanded={expanded}
    onToggle={toggleExpand}
  />
)}
```

- [ ] **Step 4: Remove the old expanded block; keep reactions/flag/variations as chrome**

Delete the `{hasWorkout && expanded && (…)}` block's layout content (~133–137: the `DetailRow`s for rawInput/coachingNotes/distTime, `<WorkoutDetails w={workout}/>`, and the `ChipRow` variations) — those now come from `WorkoutCardBody`. **Keep** the chrome that lived there: `ReactionPicker` and the flag control (~138–155), and the "N variations" `ChipRow` if you want it retained — render them as a card footer (chrome) around/after `WorkoutCardBody`. Reactions/flag are not layout-driven; decide their exact position to match the mockup (reactions on the card, flag with them) and verify on Preview.

- [ ] **Step 5: Preserve the test hook + drop unused imports**

Keep a `data-testid={`my-plan-detail-${run.id}`}` on the region `__tests__/myPlan.test.ts` asserts against (confirm what that test checks and keep it satisfied — move the testid onto the appropriate element if its old host was removed). Drop now-unused imports from `MyPlanCard` (`WorkoutDetails`, `DetailRow`, `ChipRow` if the variations chip is also removed) — grep to confirm each is unused here first. Do **not** delete `components/WorkoutDetails.tsx` — still used by `GroupRunCard.tsx` and `WorkoutCardBody.tsx`.

- [ ] **Step 6: Typecheck + unit suite + commit**

Run: `npx tsc --noEmit` → clean. Run: `npm run test:unit` → green (incl. `myPlan.test.ts` — fix the testid/assertion if it moved).
```bash
git add components/MyPlanCard.tsx
git commit -m "feat(#503): My Plan renders workout body via WorkoutCardBody (per-run layout)"
```

---

### Task 2: Verify on Preview

- [ ] **Step 1: Live verification on the Preview URL**

Signed in as the test leader, My Plan screen:
1. The condensed card shows the run's **Upfront** fields (not the old one-liner); "Show details" reveals the When-expanded fields.
2. Tapping the **run name** still navigates to the run page; the rest of the card no longer toggles on tap (only the "Show details" button does).
3. Expanding still fires `my_week_card_expanded` (check PostHog/network, or the capture call).
4. Reactions and the flag control are still present and work.
5. If you follow (or can seed) **two runs with different saved layouts**, confirm each card reflects its own run's layout.
6. A slot with no chosen workout still renders its "no workout" state, no crash.
Capture before/after My Plan screenshots (condensed + expanded) in the PR.

- [ ] **Step 2: Migration?** None.

---

## Self-Review

**1. Spec coverage (Story 4 — final leg):** My Plan adopts the shared renderer, per-run layout (Task 1) ✓; condensed = Upfront, expanded adds When-expanded, "Show details" button (decisions 1–2) ✓; reactions/flag/variations chrome preserved (decision 3) ✓; analytics + run-name nav preserved ✓; verified live incl. two-run per-layout (Task 2) ✓. Completes decision B (all three surfaces honor the layout).

**2. Placeholder scan:** The one judgement left — exact chrome (reactions/flag) placement — is pinned to the mockup + a Preview check, not left vague. All else references concrete line ranges and the shipped `WorkoutCardBody` interface.

**3. Type consistency:** `WorkoutCardBody` gets `workout: WorkoutVariantRow` (`item.workout`, guarded non-null) and `layout: CardTemplate | null` (`item.run.cardTemplate`), matching #501. `expanded`/`toggleExpand` are the existing `MyPlanCard` state/handler.

**4. Review Focus:** run-name nav, analytics firing, per-run layout, null-workout, and chrome retention each map to a Task-1 constraint and a Task-2 verification step. Section non-empty.
