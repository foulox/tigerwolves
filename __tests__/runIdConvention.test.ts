import { describe, test, expect } from 'vitest'
import { sql } from '../lib/db'
import { slugifyRunName } from '../lib/runIdentity'

// #445: every run's id must equal slugifyRunName(name). This is the invariant that
// lets #365 seed the directory catalog and drop nbr_directory_id. Runs only against
// the test-data branch (where CI seeds a known set); off-test-data it skips, matching
// the adminRunsData.test.ts pattern — a plain `npx vitest run` locally does not hit
// a live DB.
const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
const onTestData = (process.env.DATABASE_URL ?? '').includes(TEST_DATA_HOST)

describe.skipIf(!onTestData)('every run id follows slugify(name)', () => {
  test('id === slugifyRunName(name) for all real runs', async () => {
    // Exclude the `test-` sandbox runs that other integration tests create (and tear
    // down) in parallel — several deliberately use non-canonical ids to exercise the
    // shadow/near-miss guards, and a parallel worker's transient row would otherwise
    // race this assertion. The invariant #365 depends on is about the REAL runs.
    const runs = await sql`SELECT id, name FROM runs WHERE id NOT LIKE 'test-%'`
    const offenders = runs.filter((r) => r.id !== slugifyRunName(r.name as string))
    expect(offenders.map((r) => `${r.id} != slugify(${r.name})`)).toEqual([])
  })
})
