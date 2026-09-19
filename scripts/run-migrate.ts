import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { neon } from '@neondatabase/serverless'

// Consolidated migration runner (#415). Applies the base schema (migrate.sql)
// followed by every incremental migrate-<N>.sql in numeric order. Every
// migration in this repo is written to be replay-safe (CREATE ... IF NOT EXISTS,
// ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS then ADD, seed INSERTs
// guarded by WHERE NOT EXISTS / ON CONFLICT, constant UPDATEs) — so running the
// whole set twice against the same database is a no-op the second time. There is
// no migration-tracking table by design; idempotency is the contract.
//
// This is what makes the demo-schema auto-sync (.github/workflows/sync-demo-schema.yml)
// safe to run on every push to main: it just replays the merged set against the
// demo-data branch, bringing it current without a destructive re-fork.

/**
 * Return only the migration SQL files (migrate.sql + migrate-<N>.sql), ordered
 * so the base schema runs first and numbered migrations follow in ascending
 * numeric order (not lexicographic — migrate-99 before migrate-100). Non-SQL
 * files and non-migration files are dropped. Does not mutate its input.
 */
export function sortMigrationFiles(filenames: string[]): string[] {
  const order = (name: string): number | null => {
    if (name === 'migrate.sql') return -1 // base schema first
    const m = name.match(/^migrate-(\d+)\.sql$/)
    return m ? parseInt(m[1], 10) : null
  }
  return filenames
    .filter((name) => order(name) !== null)
    .sort((a, b) => (order(a) as number) - (order(b) as number))
}

/**
 * Strip `-- ...` line comments, split on `;`, and return the non-empty trimmed
 * statements. Comments are stripped before splitting so a semicolon inside
 * comment text can't create a bogus statement. (Unchanged from the original
 * single-file runner — proven against migrate.sql's dollar-quoted seed block.)
 */
export function parseStatements(sql: string): string[] {
  const stripped = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
  return stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Guard a migration run to a specific database host. If `onlyHost` is set, the
 * connection `url`'s host must contain it — otherwise throw. Used by the CI
 * demo-sync job so a mis-resolved connection string can never apply migrations
 * to production or the E2E-wipe branch. A no-op when `onlyHost` is undefined.
 */
export function assertHostAllowed(url: string | undefined, onlyHost: string | undefined): void {
  if (!onlyHost) return
  if (!url) {
    throw new Error(
      `run-migrate refuses to run: MIGRATE_ONLY_HOST is set to "${onlyHost}" but DATABASE_URL is not set.`
    )
  }
  if (!url.includes(onlyHost)) {
    throw new Error(
      `run-migrate refuses to run: DATABASE_URL host does not contain the required "${onlyHost}". ` +
        `Refusing to apply migrations to an unexpected database.`
    )
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  assertHostAllowed(url, process.env.MIGRATE_ONLY_HOST)

  const sql = neon(url)
  const files = sortMigrationFiles(readdirSync(__dirname))
  console.log(`Applying ${files.length} migration file(s) against ${url.split('@')[1]}`)

  for (const file of files) {
    const statements = parseStatements(readFileSync(join(__dirname, file), 'utf8'))
    console.log(`\n▸ ${file} — ${statements.length} statement(s)`)
    for (const statement of statements) {
      await sql.query(statement)
      console.log(`  ✓ ${statement.split('\n')[0]}`)
    }
  }
  console.log('\nMigration complete.')
}

// Direct-run guard — importing this module (from __tests__/runMigrate.test.ts)
// must NOT execute main(). Only run when invoked directly via tsx.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
