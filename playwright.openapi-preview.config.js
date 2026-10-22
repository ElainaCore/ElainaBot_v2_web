import { defineConfig } from '@playwright/test'
import config from './playwright.config.js'

export default defineConfig({
  ...config,
  testMatch: ['openapi.spec.js'],
  outputDir: './.cache/openapi-preview-results',
  use: { ...config.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    ...config.webServer,
    command: 'npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/web/',
  },
})
