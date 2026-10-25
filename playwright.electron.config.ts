/**
 * The packaged-build check (#29 `packaged-smoke`, #2 done item 8, #11 acceptance 7): launches the
 * `electron-builder --dir` output with Playwright's Electron support, which Playwright documents
 * as experimental, so it runs nightly and by hand, never as a merge gate. Build first with
 * `npm run electron:build`; on Linux run it under `xvfb-run`.
 */
import { register } from 'node:module'
import { defineConfig } from '@playwright/test'

// The game's bare JSON imports load under Node's ESM loader in every spec (ticket 903).
register('./e2e/jsonImportHook.mjs', import.meta.url)

export default defineConfig({
  testDir: 'e2e/packaged',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
})
