# Implementation Notes — story/201-store-selected-variations

Story: #201 — Store chosen variation(s) when setting a plan

## Plan summary

Add `selected_variations TEXT[]` to the `schedule` table. Wire it through:
`PlanClient.tsx → setPlanWorkout (actions.ts) → dbSetScheduleWorkout (db.ts) → DB`

`ScheduleEntry` in `lib/data.ts` gains `selectedVariations: string[]`.

## Deviations

**Migration approach — ran against production first, then staging.** `.env.local` turned out to point at the production Neon branch (`br-square-river-atjn0mzq`, confirmed via Neon API), not staging. Migration ran successfully on both. The `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is idempotent so re-running is safe.

**Pre-existing test timeouts.** The Neon connection pool has a cold-start latency that causes ~5-7 tests to time out on the first run of `npm run test:unit`. These were present on `main` before this branch. All tests that *can* pass (45-46 out of 52) pass; the failures are pure timeout noise. Conservative option taken: log and proceed rather than increasing vitest timeout, since that's a config change outside this story's scope.
