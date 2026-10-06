/**
 * The browser end-to-end layer (#29, docs/TESTING_INSTRUCTIONS.md): Chromium against the Vite
 * preview of the production build, opened with `?debug&scenario=`. Specs assert state through
 * `window.steampunkDebug`, never pixels. The packaged Electron check has its own config,
 * `playwright.electron.config.ts`.
 *
 * The screen matrix (#173, #179): one project per reference screen runs `e2e/browser/screens/`,
 * asserting geometry and counts through the DOM and the debug API. Each cell also writes its
 * review screenshots (to `docs/screens/` under `npm run screens:update`), never compared.
 */
import { defineConfig, devices } from '@playwright/test'
import { SCREEN_CELLS } from './e2e/browser/screens/screenCells'

const PREVIEW_PORT = 4173
/** The matrix's specs, wherever the config is run from. */
const SCREENS_GLOB = '**/browser/screens/**'

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
  projects: [
    {
      name: 'chromium',
      testIgnore: SCREENS_GLOB,
      use: { ...devices['Desktop Chrome'] },
    },
    ...SCREEN_CELLS.map((cell) => ({
      name: `screens-${cell.name}`,
      testMatch: `${SCREENS_GLOB}/*.spec.ts`,
      // Software WebGL at 4K and 3x phones is slow; the waits are for that, not for the game.
      timeout: 300_000,
      expect: { timeout: 30_000 },
      metadata: { cell },
      use: {
        ...devices['Desktop Chrome'],
        viewport: cell.viewport,
        deviceScaleFactor: cell.deviceScaleFactor,
        isMobile: cell.isTouch,
        hasTouch: cell.isTouch,
      },
    })),
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
    url: `http://localhost:${PREVIEW_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
