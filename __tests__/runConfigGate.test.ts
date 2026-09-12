import { describe, test, expect } from 'vitest'
import { runConfigGate } from '../lib/runConfigGate'

describe('runConfigGate', () => {
  test('signed-out visitor is sent to sign-in', () => {
    expect(runConfigGate({ isSignedIn: false, isLeader: false, hasRun: false })).toBe('signin')
  })

  test('signed-in non-leader is redirected away (unchanged behavior)', () => {
    expect(runConfigGate({ isSignedIn: true, isLeader: false, hasRun: false })).toBe('redirect')
  })

  test('leader with no linked run gets the diagnostic, not a redirect', () => {
    expect(runConfigGate({ isSignedIn: true, isLeader: true, hasRun: false })).toBe('diagnostic')
  })

  test('leader with a linked run proceeds to Run Settings', () => {
    expect(runConfigGate({ isSignedIn: true, isLeader: true, hasRun: true })).toBe('ok')
  })

  test('a stray hasRun with no leader role still redirects (auth wins over data)', () => {
    // Defense in depth: never render Run Settings for a non-leader even if a run
    // row happens to resolve.
    expect(runConfigGate({ isSignedIn: true, isLeader: false, hasRun: true })).toBe('redirect')
  })
})
