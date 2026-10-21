import { defineConfig } from '@playwright/test'
import config from './playwright.config.js'

export default defineConfig({
  ...config,
  testMatch: ['analytics.spec.js', 'statistics.spec.js', 'messages.spec.js', 'routes-smoke.spec.js'],
  outputDir: './.cache/panel-preview-results',
  use: { ...config.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    ...config.webServer,
    command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/web/'
  }
})
