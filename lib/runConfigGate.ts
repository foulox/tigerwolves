// The access decision for /run-config, extracted from the page so it can be
// unit-tested (#327). The page previously collapsed three distinct conditions
// into one silent `redirect('/')`, which made "leader but not linked to a run"
// indistinguishable from "not a leader" — the exact state that silently bounced
// leaders to Schedule on Preview deployments.
//
//   signin     → not authenticated
//   redirect   → authenticated but not a leader (unchanged: go to '/')
//   diagnostic → a leader whose account isn't linked to any run (show why)
//   ok         → a leader with a linked run (render Run Settings)
export type RunConfigAccess = 'signin' | 'redirect' | 'diagnostic' | 'ok'

export function runConfigGate(input: {
  isSignedIn: boolean
  isLeader: boolean
  hasRun: boolean
}): RunConfigAccess {
  if (!input.isSignedIn) return 'signin'
  if (!input.isLeader) return 'redirect'
  if (!input.hasRun) return 'diagnostic'
  return 'ok'
}
