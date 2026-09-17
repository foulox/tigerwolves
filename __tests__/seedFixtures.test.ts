import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { isSeedAllowed, ensureLeaderLink } from '../lib/seedFixtures'
import { sql } from '../lib/db'

describe('isSeedAllowed', () => {
  test('blocks production', () => {
    expect(isSeedAllowed('production')).toBe(false)
  })

  test('allows preview and development', () => {
    expect(isSeedAllowed('preview')).toBe(true)
    expect(isSeedAllowed('development')).toBe(true)
  })

  test('allows local (VERCEL_ENV unset)', () => {
    expect(isSeedAllowed(undefined)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ensureLeaderLink email dedup (#385, AC4) — staging DB
// ---------------------------------------------------------------------------
// A preview branched from production carries a leader row with the real email but
// a *production*-instance clerk_user_id, which can never match this deployment's
// dev-instance id. Linking must match on email, repoint clerk_user_id, and create
// NO second row. Staging-gated like the other DB tests.

const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

describe.skipIf(!onStaging)('ensureLeaderLink dedupes a forked prod row by email (staging)', () => {
  const RUN = 'test-ensurelink-385'
  const EMAIL = 'ensurelink-385@example.com'
  const PROD_CLERK_ID = 'user_prodinstance_385' // as forked from production
  const DEV_CLERK_ID = 'user_devinstance_385' // this deployment's Clerk instance
  const NAME = 'Fork Test 385'

  beforeAll(async () => {
    await sql`INSERT INTO runs (id, name) VALUES (${RUN}, 'EnsureLink Test Run 385') ON CONFLICT (id) DO NOTHING`
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    // The forked-from-prod row: real email, a prod-instance clerk id.
    await sql`
      INSERT INTO run_leaders (run_id, name, email, clerk_user_id, sort_order, active)
      VALUES (${RUN}, ${NAME}, ${EMAIL}, ${PROD_CLERK_ID}, 1, true)
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM run_leaders WHERE run_id = ${RUN}`
    await sql`DELETE FROM runs WHERE id = ${RUN}`
  })

  test('matching by email repoints clerk_user_id to this instance, no second row, name preserved', async () => {
    const created = await ensureLeaderLink({
      runId: RUN,
      clerkUserId: DEV_CLERK_ID,
      email: EMAIL,
      name: 'Ignored On Match',
    })
    // A match, not an insert.
    expect(created).toBe(false)

    const rows = await sql`
      SELECT clerk_user_id, name FROM run_leaders WHERE run_id = ${RUN} AND email = ${EMAIL}
    `
    expect(rows).toHaveLength(1)
    expect(rows[0].clerk_user_id).toBe(DEV_CLERK_ID)
    expect(rows[0].name).toBe(NAME) // name untouched on match
  })
})
