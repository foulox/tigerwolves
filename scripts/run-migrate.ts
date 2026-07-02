import { readFileSync } from 'fs'
import { join } from 'path'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const sql = neon(url)
const migrate = readFileSync(join(__dirname, 'migrate.sql'), 'utf8')

const statements = migrate
  .split(';')
  .map(s => s.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n').trim())
  .filter(s => s.length > 0)

async function main() {
  console.log(`Running ${statements.length} statements against ${url!.split('@')[1]}`)
  for (const statement of statements) {
    await sql.query(statement)
    console.log(`  ✓ ${statement.split('\n')[0]}`)
  }
  console.log('Migration complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
