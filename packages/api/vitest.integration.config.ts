import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
