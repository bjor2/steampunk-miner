/**
 * The browser end-to-end layer (#29, docs/TESTING_INSTRUCTIONS.md): Chromium against the Vite
 * preview of the production build, opened with `?debug&scenario=`. Specs assert state through
 * `window.steampunkDebug`, never pixels. The packaged Electron check has its own config,
 * `playwright.electron.config.ts`.
 */
import { defineConfig, devices } from '@playwright/test'

const PREVIEW_PORT = 4173

export default defineConfig({
  testDir: 'e2e/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PREVIEW_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
    url: `http://localhost:${PREVIEW_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
