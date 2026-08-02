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
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // The dev server is a separate child process — it doesn't inherit the
    // dotenv.config() call above, so these are forwarded explicitly: DATABASE_URL
    // to keep it on the same staging fixture data the seed step just wrote, and
    // the Clerk keys so e2e/auth.setup.ts's sign-in resolves against the same
    // Clerk instance PLAYWRIGHT_TEST_EMAIL's leader account actually lives on.
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? '',
    },
  },
})
