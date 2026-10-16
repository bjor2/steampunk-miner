/**
 * The browser end-to-end layer (#29, docs/TESTING_INSTRUCTIONS.md): Chromium against the Vite
 * preview of the production build, opened with `?debug&scenario=`. Specs assert state through
 * `window.steampunkDebug`, never pixels. The packaged Electron check has its own config,
 * `playwright.electron.config.ts`.
 *
 * The screen matrix (#173, #179): one project per reference screen runs `e2e/browser/screens/`,
 * asserting geometry and counts through the DOM and the debug API. Each cell also writes its
 * review screenshots (to `docs/screens/` under `npm run screens:update`), never compared.
 *
 * The mobile projects (#470 P1-10, ticket 481): a Pixel 7 on Chromium and an iPhone 13 on WebKit,
 * in landscape, run `e2e/browser/mobile/` and the matrix's touch specs (`mobileDevices.ts`).
 * Emulation only, never "verified on device" (#482). Without WebKit installed the iPhone project's
 * tests skip with the install hint.
 */
import { defineConfig, devices } from '@playwright/test'
import {
  cellOfDevice,
  ENGINE_MISSING_MESSAGE,
  isEngineInstalled,
  landscapeUseOf,
  MOBILE_DEVICES,
  MOBILE_GLOB,
  MOBILE_SPECS,
} from './e2e/browser/mobile/mobileDevices'
import { SCREEN_CELLS } from './e2e/browser/screens/screenCells'

/** `E2E_PORT` moves the preview off the shared 4173 when another checkout serves its own build. */
const PREVIEW_PORT = Number(process.env.E2E_PORT ?? 4173)
const isCi = Boolean(process.env.CI)
/**
 * The box Tester's 8 cores, Playwright's own default there (#190: e2e no longer runs on GitHub's
 * 4-vCPU runners, ca26be6b); fixed so the run does not change shape with the machine.
 */
const CI_WORKERS = 4
/** The matrix's specs, wherever the config is run from. */
const SCREENS_GLOB = '**/browser/screens/**'

// Said once per run as well as on each skipped test, so a run without WebKit reads why at the top.
if (!isEngineInstalled('webkit')) console.warn(`mobile-webkit-iphone13: ${ENGINE_MISSING_MESSAGE}`)

export default defineConfig({
  testDir: 'e2e/browser',
  fullyParallel: false,
  forbidOnly: isCi,
  workers: isCi ? CI_WORKERS : undefined,
  // A load flake on the shared box passes on its retry and is counted as flaky in the summary and
  // in e2e-report/results.json (`npm run test:e2e:timings`), so slowness stays visible (#190).
  retries: isCi ? 1 : 0,
  reporter: isCi
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'e2e-report/results.json' }]]
    : 'list',
  use: {
    baseURL: `http://localhost:${PREVIEW_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: [SCREENS_GLOB, MOBILE_GLOB],
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
    ...MOBILE_DEVICES.map((device) => ({
      name: device.project,
      testMatch: MOBILE_SPECS,
      // The matrix's waits: software GL on a 3x phone screen, and WebKit's is slower still.
      timeout: 300_000,
      expect: { timeout: 30_000 },
      metadata: { cell: cellOfDevice(device) },
      use: landscapeUseOf(device),
    })),
  ],
  webServer: {
    // Builds only when dist/ is older than a build input: the box Tester has just built (#190).
    command: `node scripts/e2e/buildPreviewIfStale.mjs && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
    url: `http://localhost:${PREVIEW_PORT}`,
    reuseExistingServer: !isCi,
    timeout: 180_000,
  },
})
