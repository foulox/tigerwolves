# Runner Experience — UI reference (2026-09-12)

Approved screens from the 2026-09-12 runner-experience brainstorm. Build reference for stories R1–R4.

- **`runner-experience-screens.html`** — open in a browser (mobile width, 390px). Contains:
  1. **My Week** (home) + the **TigerWolves per-run page** (leader view) — the per-run page is today's Schedule page, run-scoped.
  2. **All Runs** (logged in) — the picker + directory with the three tiers and join/leave.

Design reasoning and the R1–R4 story breakdown: [`../2026-09-12-runner-experience-redesign-design.md`](../2026-09-12-runner-experience-redesign-design.md).

Visual precedent for the existing runner prototype: #302 (`app/runner/*`, demo data) and the shipped public All Runs #303 (`app/all-runs/`, hardcoded).

These are fidelity mockups of layout and content shape, not pixel-exact final CSS — match the app's existing Tailwind card/pill/reaction components when building.

**The expanded card detail is abbreviated in these mockups.** The real expanded view reuses today's `ScheduleCard` + `WorkoutDetails` components verbatim and keeps every field the current Schedule page shows (Instructions, Distance/Time, Reason, Energy System, HR Zone, RPE, Turnaround, Variations, flag, reaction). See the "Component reuse & expanded-detail fidelity" section of the design doc.
