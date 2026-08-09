import type { Workout } from '@/lib/data'

// #274 decision: editing is blocked for every workout reachable through this
// page. AddWorkoutForm now writes new workouts into workout_families/
// workout_variants, not the legacy `workouts` table this page's data comes
// from — so any workout reaching this form is, by construction, one of the
// pre-#274 workouts that has no variant row yet. Re-enable real editing once
// #275's backfill exists and #276/#277 rewire reads onto the new schema.
export default function EditWorkoutForm({ workout }: { workout: Workout }) {
  return (
    <div className="px-4 pt-10 pb-10">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Edit Workout</h1>
      </header>

      <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Workout</p>
        <p className="font-semibold text-gray-900">{workout.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{workout.category} · {workout.type}</p>
      </div>

      <p className="text-sm text-gray-700 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-6">
        Editing isn&apos;t available for this workout yet — it hasn&apos;t been moved to the new
        workout format. Check back soon.
      </p>

      <a href="/library"
        className="block w-full py-4 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm text-center touch-manipulation">
        Back to Library
      </a>
    </div>
  )
}
