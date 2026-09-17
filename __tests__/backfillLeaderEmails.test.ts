import { describe, test, expect } from 'vitest'
import { primaryEmail } from '../scripts/backfill-leader-emails'

// Unit tests for the pure email-selection helper used by the backfill script.
// The script itself (Neon + Clerk I/O) is exercised by running it against a real
// DB; only this selection logic is unit-testable in isolation.

describe('primaryEmail', () => {
  test('returns the lowercased primary email address', () => {
    const user = {
      primaryEmailAddressId: 'eml_1',
      emailAddresses: [{ id: 'eml_1', emailAddress: 'Lou.Fox@Example.COM' }],
    }
    expect(primaryEmail(user)).toBe('lou.fox@example.com')
  })

  test('picks the primary over a secondary address', () => {
    const user = {
      primaryEmailAddressId: 'eml_primary',
      emailAddresses: [
        { id: 'eml_secondary', emailAddress: 'secondary@example.com' },
        { id: 'eml_primary', emailAddress: 'primary@example.com' },
      ],
    }
    expect(primaryEmail(user)).toBe('primary@example.com')
  })

  test('falls back to the first address when no primary id matches', () => {
    const user = {
      primaryEmailAddressId: null,
      emailAddresses: [{ id: 'eml_1', emailAddress: 'Only@Example.com' }],
    }
    expect(primaryEmail(user)).toBe('only@example.com')
  })

  test('returns null when the user has no email addresses', () => {
    const user = { primaryEmailAddressId: null, emailAddresses: [] }
    expect(primaryEmail(user)).toBeNull()
  })
})
