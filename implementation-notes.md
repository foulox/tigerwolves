# Story #170 — Implementation Notes

## Deviations

- **`resolveWorkout` extracted to `lib/scheduleUtils.ts`** (not inline in `page.tsx` or inside `ScheduleCard.tsx`). Conservative choice: avoids the `'use client'` boundary import question and keeps the function in a pure, framework-agnostic file importable by both `page.tsx` (server component) and the Vitest test runner. The plan's Vitest test file is named `scheduleCard.test.ts` which correctly describes the subject matter, even though the function lives in `lib/`.

- **Workout resolution lives in `page.tsx`, not `ScheduleCard.tsx`**. ScheduleCard receives `workout: Workout | null` as a resolved prop. This matches the plan's data-flow description and keeps the server component responsible for data resolution before handing off to the client component.

- **`TYPE_COLORS` removed from `page.tsx`**. It was duplicated in `ScheduleCard.tsx`. Removing it from the server component is correct since it was only used to render the badge inside the card markup that moved to `ScheduleCard`.

- **`formatDate` removed from `page.tsx`** for the same reason — it only applied to the card markup.

- **`Link` import removed from `page.tsx`** — no longer needed after extracting card to `ScheduleCard.tsx`.

## Errors

_(none so far)_
