import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { SEEDED_RUNS } from '../scripts/fixtures/curatedWorkouts'
import { parseStatements } from '../scripts/run-migrate'
import { sql } from '../lib/db'

// #426 — shadow-run guard. The e2e/unit fixtures must seed only REAL runs; no
// fixture may invent a SEPARATE run that shadows a real one (the deleted
// `run_id 'doves'` / "Mourning Doves" shadow, one string off the real
// `wednesday-mourning-doves`). This guard fails if that shadow — or any
// near-miss of a real run id — is reintroduced.

const SCRIPTS_DIR = join(process.cwd(), 'scripts')
const FIXTURES_DIR = join(SCRIPTS_DIR, 'fixtures')

// The canonical real run ids the app knows about. A fixture may seed these and
// only these; anything else is a shadow.
const REAL_RUN_IDS = ['tigerwolves', 'mmer', 'wednesday-mourning-doves']

/** Standard Levenshtein edit distance. */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

describe('shadow-run guard (AC1)', () => {
  test('every seeded run id is an exact real run id', () => {
    for (const run of SEEDED_RUNS) {
      expect(REAL_RUN_IDS, `seeded run id "${run.id}" is not a real run id`).toContain(run.id)
    }
  })

  test('no seeded run id is a near-miss (edit-distance ≤ 1) of a DIFFERENT real run id', () => {
    for (const run of SEEDED_RUNS) {
      for (const real of REAL_RUN_IDS) {
        if (real === run.id) continue
        expect(
          editDistance(run.id, real),
          `seeded run id "${run.id}" is edit-distance ≤ 1 from real run id "${real}" — a shadow`,
        ).toBeGreaterThan(1)
      }
    }
  })

  test('no seeded run is named "Mourning Doves" (the deleted shadow\'s name)', () => {
    for (const run of SEEDED_RUNS) {
      expect(run.name).not.toBe('Mourning Doves')
    }
  })

  test('the deleted shadow fixture files are gone', () => {
    expect(existsSync(join(FIXTURES_DIR, 'dovesLongRun.ts'))).toBe(false)
    expect(existsSync(join(SCRIPTS_DIR, 'seed-doves.ts'))).toBe(false)
  })

  test('no seed script contains the deleted `doves` shadow run-id literal', () => {
    // Scan every TS script (scripts/ + scripts/fixtures/) for the shadow run-id
    // literal `'doves'` — a new seed script that reintroduced it is caught too, not
    // just the two that used to reference it. (The real run id is
    // 'wednesday-mourning-doves', a different quoted string.)
    const files = [
      ...readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.ts')).map(f => join(SCRIPTS_DIR, f)),
      ...readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.ts')).map(f => join(FIXTURES_DIR, f)),
    ]
    for (const file of files) {
      const body = readFileSync(file, 'utf8')
      expect(body.includes("'doves'"), `${file} still references the 'doves' shadow run id`).toBe(false)
    }
  })
})

// #426 AC4 — the Tempo→Straight Tempo migration is idempotent (a no-op on replay).
describe('migrate-426 idempotency (AC4)', () => {
  const statements = parseStatements(readFileSync(join(SCRIPTS_DIR, 'migrate-426.sql'), 'utf8'))

  test('is a single constant UPDATE guarded by WHERE type = Tempo', () => {
    // Idempotent by construction: after the first run no row has type 'Tempo', so a
    // replay matches nothing. A constant SET (no per-row computation) is replay-safe.
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/UPDATE\s+workout_families\s+SET\s+type\s*=\s*'Straight Tempo'\s+WHERE\s+type\s*=\s*'Tempo'/i)
  })

  // Staging-gated integration: actually apply it twice against a sandbox row.
  const STAGING_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'
  const onStaging = (process.env.DATABASE_URL ?? '').includes(STAGING_HOST)

  describe.skipIf(!onStaging)('applies twice with no drift (staging)', () => {
    const GROUP = 'Tempo Migration TEST 426'
    let groupId: number

    async function cleanup(): Promise<void> {
      const g = await sql`SELECT id FROM run_groups WHERE name = ${GROUP}`
      if (!g.length) return
      const gid = g[0].id as number
      await sql`DELETE FROM workout_variants WHERE family_id IN (SELECT id FROM workout_families WHERE run_group_id = ${gid})`
      await sql`DELETE FROM workout_families WHERE run_group_id = ${gid}`
      await sql`DELETE FROM run_groups WHERE id = ${gid}`
    }

    beforeAll(async () => {
      await cleanup()
      groupId = (await sql`INSERT INTO run_groups (name, venue) VALUES (${GROUP}, 'road') RETURNING id`)[0].id as number
      await sql`INSERT INTO workout_families (name, category, type, run_group_id) VALUES ('Legacy Tempo 426', 'Quality', 'Tempo', ${groupId})`
    })
    afterAll(cleanup)

    test('first run retypes Tempo→Straight Tempo; second run is a no-op', async () => {
      await sql.query(statements[0])
      const first = await sql`SELECT type FROM workout_families WHERE run_group_id = ${groupId}`
      expect(first[0].type).toBe('Straight Tempo')

      // Second run must change nothing (no rows left with type 'Tempo').
      await sql.query(statements[0])
      const stillTempo = await sql`SELECT COUNT(*)::int AS n FROM workout_families WHERE run_group_id = ${groupId} AND type = 'Tempo'`
      expect(stillTempo[0].n).toBe(0)
      const second = await sql`SELECT type FROM workout_families WHERE run_group_id = ${groupId}`
      expect(second[0].type).toBe('Straight Tempo')
    })
  })
})
