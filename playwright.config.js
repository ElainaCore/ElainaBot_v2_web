import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  outputDir: './.cache/test-results',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 6000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/web/',
    reuseExistingServer: !process.env.CI
  }
})
