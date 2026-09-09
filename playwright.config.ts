import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

// Loaded explicitly by filename — never falls back to .env.local (production) no
// matter how NODE_ENV happens to be set in the shell this runs from. Fixture
// data lives on the staging Neon branch; see scripts/seed-e2e.ts.
dotenv.config({ path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    // In CI: build first so every route is pre-compiled, eliminating the
    // per-route first-compile delay (60s+ in next dev) that blows the per-test
    // timeout. Locally: dev server for fast iteration. next start runs with
    // NODE_ENV=production, so E2E_TEST_MODE=true is forwarded to allow the
    // e2e-revalidate route handler to bypass its production guard.
    command: process.env.CI
      ? 'npm run build && npm run start'
      : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 300000, // 5 min — next build takes ~3 min in CI
    // The server is a separate child process — these vars don't inherit from
    // dotenv.config() above, so they're forwarded explicitly.
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? '',
      E2E_TEST_MODE: 'true',
    },
  },
})
