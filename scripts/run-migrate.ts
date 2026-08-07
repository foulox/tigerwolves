import { readFileSync } from 'fs'
import { join } from 'path'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const sql = neon(url)
const migrate = readFileSync(join(__dirname, 'migrate.sql'), 'utf8')

// Strip -- comments before splitting so semicolons inside comment text don't create bogus statements
const stripped = migrate.split('\n').map(line => line.replace(/--.*$/, '')).join('\n')
const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0)

async function main() {
  console.log(`Running ${statements.length} statements against ${url!.split('@')[1]}`)
  for (const statement of statements) {
    await sql.query(statement)
    console.log(`  ✓ ${statement.split('\n')[0]}`)
  }
  console.log('Migration complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
