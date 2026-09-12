import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    setupFiles: ['__tests__/setup.ts'],
    // Seeds the staging DB once before the suite so the staging-only integration
    // tests in db.test.ts have data (see __tests__/globalSetup.ts). No-op
    // off-staging. globalSetup is excluded from `include` above (not a *.test.ts).
    globalSetup: ['__tests__/globalSetup.ts'],
  },
})
