/**
 * The packaged-build check (#29 `packaged-smoke`, #2 done item 8, #11 acceptance 7): launches the
 * `electron-builder --dir` output with Playwright's Electron support, which Playwright documents
 * as experimental, so it runs nightly and by hand, never as a merge gate. Build first with
 * `npm run electron:build`; on Linux run it under `xvfb-run`.
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e/packaged',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
})
