export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number]

export type RunIdentityValues = {
  name: string
  dayOfWeek: string
  emoji: string
  meetingTime: string
  meetingLocation: string
  description: string
}

export function validateRunIdentity(v: RunIdentityValues): { error?: string } {
  // Trim and validate name
  const trimmedName = v.name.trim()
  if (!trimmedName) {
    return { error: 'Name is required' }
  }

  // Validate dayOfWeek
  if (!DAYS_OF_WEEK.includes(v.dayOfWeek as DayOfWeek)) {
    return { error: 'Invalid day' }
  }

  // All other fields are free text — no validation
  return {}
}

export function slugifyRunName(name: string): string {
  // Lowercase, then replace runs of non-alphanumerics with single dash
  const lowercased = name.toLowerCase()
  const withDashes = lowercased.replace(/[^a-z0-9]+/g, '-')
  // Strip leading/trailing dashes
  const trimmed = withDashes.replace(/^-+|-+$/g, '')
  return trimmed
}
