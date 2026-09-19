import { describe, it, expect } from 'vitest'
import {
  sortMigrationFiles,
  parseStatements,
  assertHostAllowed,
} from '@/scripts/run-migrate'

describe('sortMigrationFiles', () => {
  it('puts migrate.sql first, before any numbered migration', () => {
    const sorted = sortMigrationFiles(['migrate-401.sql', 'migrate.sql', 'migrate-310.sql'])
    expect(sorted[0]).toBe('migrate.sql')
  })

  it('orders numbered migrations numerically ascending (404 after 401)', () => {
    const sorted = sortMigrationFiles(['migrate-404.sql', 'migrate-401.sql', 'migrate.sql'])
    expect(sorted).toEqual(['migrate.sql', 'migrate-401.sql', 'migrate-404.sql'])
  })

  it('sorts numerically, not lexicographically (99 before 100)', () => {
    const sorted = sortMigrationFiles(['migrate-100.sql', 'migrate-99.sql'])
    expect(sorted).toEqual(['migrate-99.sql', 'migrate-100.sql'])
  })

  it('excludes non-migration files (e.g. .gs scripts, run-migrate itself)', () => {
    const sorted = sortMigrationFiles([
      'migrate.sql',
      'migrate-401.sql',
      'migrate-workout-library.gs',
      'run-migrate.ts',
      'refresh-demo.ts',
    ])
    expect(sorted).toEqual(['migrate.sql', 'migrate-401.sql'])
  })

  it('does not mutate the input array', () => {
    const input = ['migrate-404.sql', 'migrate.sql']
    sortMigrationFiles(input)
    expect(input).toEqual(['migrate-404.sql', 'migrate.sql'])
  })
})

describe('parseStatements', () => {
  it('strips -- comments and splits on semicolons', () => {
    const sql = `-- a comment\nCREATE TABLE foo (id INT);\nINSERT INTO foo VALUES (1);`
    expect(parseStatements(sql)).toEqual([
      'CREATE TABLE foo (id INT)',
      'INSERT INTO foo VALUES (1)',
    ])
  })

  it('filters out empty statements (trailing semicolon, blank lines)', () => {
    const sql = `CREATE TABLE foo (id INT);\n\n;\n`
    expect(parseStatements(sql)).toEqual(['CREATE TABLE foo (id INT)'])
  })

  it('strips a trailing inline comment without dropping the statement', () => {
    const sql = `ALTER TABLE runs ADD COLUMN kind TEXT; -- forward-compat`
    expect(parseStatements(sql)).toEqual(['ALTER TABLE runs ADD COLUMN kind TEXT'])
  })
})

describe('assertHostAllowed', () => {
  const demoUrl = 'postgresql://u:p@ep-ancient-math-atvtz5p9-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'
  const prodUrl = 'postgresql://u:p@ep-square-river-atjn0mzq-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'

  it('passes when the url host contains the required substring', () => {
    expect(() => assertHostAllowed(demoUrl, 'ep-ancient-math')).not.toThrow()
  })

  it('throws when the url host does not contain the required substring', () => {
    expect(() => assertHostAllowed(prodUrl, 'ep-ancient-math')).toThrow(/ep-ancient-math/)
  })

  it('checks the host only — the substring hiding in the password does not pass', () => {
    const sneaky = 'postgresql://user:ep-ancient-math@ep-square-river-atjn0mzq.us-east-2.aws.neon.tech/neondb'
    expect(() => assertHostAllowed(sneaky, 'ep-ancient-math')).toThrow()
  })

  it('is a no-op when no host constraint is given', () => {
    expect(() => assertHostAllowed(prodUrl, undefined)).not.toThrow()
  })

  it('throws when the constraint is set but the url is missing', () => {
    expect(() => assertHostAllowed(undefined, 'ep-ancient-math')).toThrow()
  })
})
