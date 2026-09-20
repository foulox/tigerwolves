// Vitest globalSetup — runs once before the unit suite. Several db.test.ts tests
// are integration tests that read live data from the test-data branch (fetchSchedule/fetchRaces/
// fetchWorkoutVariants, #310/#318/#319). In CI the `test` job runs `npm run
// test:unit` BEFORE `npm run test:e2e` (the step that otherwise seeds test-data),
// so without this those tests hit an empty/stale DB and fail — a deadlock, since
// a failing test:unit stops the job before e2e ever reseeds. Seeding here makes
// the unit suite self-contained: it satisfies its own data dependency, in CI and
// when run locally against test-data alike.
//
// Guarded to test-data ONLY. Off-test-data (local default = .env.local's production
// URL, or unset) this is a no-op and the data-dependent tests skip via
// skipIf(!onTestData). The import is dynamic so scripts/seed-e2e.ts's module-level
// "refuse unless test-data" guard only evaluates when we're actually on test-data —
// a static import would throw here on any non-test-data run.
const TEST_DATA_HOST = 'ep-fragrant-sunset-atmdps9n-pooler.c-9.us-east-1.aws.neon.tech'

export async function setup() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.includes(TEST_DATA_HOST)) {
    console.log('[vitest globalSetup] DATABASE_URL is not the test-data branch — skipping e2e seed')
    return
  }
  console.log('[vitest globalSetup] seeding test-data DB for integration tests…')
  const { seedE2E } = await import('../scripts/seed-e2e')
  await seedE2E()
}
