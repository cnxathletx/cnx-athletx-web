import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5171',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npx wrangler dev --port 8787',
      cwd: './packages/api',
      port: 8787,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @cnx-athletx/web',
      port: 5171,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
