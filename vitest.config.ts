import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    pool: 'threads',
    setupFiles: 'scripts/setup-vitest.ts',
    testTimeout: 10_000,
  },
})
