import { redirect } from 'next/navigation'

// #330: the runner All Runs prototype (demo data + localStorage) is retired —
// /all-runs is now the one real, auth-aware surface. Full removal of the
// RunnerNav wiring that linked here is R4 (#332).
export default function RunnerAllRunsRedirect() {
  redirect('/all-runs')
}
