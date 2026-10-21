import { defineConfig } from '@playwright/test'
import config from './playwright.config.js'

export default defineConfig({
  ...config,
  testMatch: 'messages.spec.js',
  use: { ...config.use, baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    ...config.webServer,
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/web/'
  }
})
