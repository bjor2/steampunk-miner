// Where the memory soak runs the game (#99, #102): the preview build in Chromium, or the packaged
// Electron build (`electron-builder --dir` output) with its debug API on. Each target opens one
// game window and hands back the page, `startGame()` (navigates, after the soak has attached its
// error listeners) and `close()`.
//
// Both targets get the same measurement switches: precise `performance.memory`, `gc()` for the
// sampler, and SwiftShader so a headless box draws WebGL (under Xvfb, Electron's default ANGLE on
// Mesa llvmpipe cannot create a WebGL context). They are the harness's switches, never the game's:
// the game ships with no heap or stack flags (docs/perf/runtime-flags.md).
import { _electron as electron, chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const VITE_BIN = join(REPO_ROOT, 'node_modules/vite/bin/vite.js')
const VIEWPORT = { width: 1280, height: 720 }
const MEASUREMENT_SWITCHES = [
  '--enable-precise-memory-info',
  '--js-flags=--expose-gc',
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]
/** The packaged game's launch flag for `window.steampunkDebug` (electron/launchOptions.cts). */
const DEBUG_API_FLAG = '--debug-api'

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function isAnswering(port) {
  try {
    return (await fetch(`http://localhost:${port}/`)).ok
  } catch {
    return false
  }
}

/** Starts `vite preview` of the built game; the target's `close()` stops it. */
async function startPreview(options) {
  const args = ['preview', '--outDir', options.dist, '--port', String(options.port), '--strictPort']
  const server = spawn(process.execPath, [VITE_BIN, ...args], { cwd: REPO_ROOT, stdio: 'ignore' })
  for (let tries = 0; tries < 60; tries++) {
    await sleep(500)
    if (await isAnswering(options.port)) return server
  }
  server.kill()
  throw new Error(`vite preview did not answer on port ${options.port}`)
}

async function openBrowserPage(options) {
  const browser = await chromium.launch({
    executablePath: options.browserPath,
    args: MEASUREMENT_SWITCHES,
  })
  return { browser, page: await browser.newPage({ viewport: VIEWPORT }) }
}

/** The preview build in Chromium, `?debug` for the debug API. */
export async function openBrowserTarget(options) {
  const server = await startPreview(options)
  try {
    const { browser, page } = await openBrowserPage(options)
    return {
      kind: 'browser',
      page,
      startGame: () => page.goto(`http://localhost:${options.port}/?debug`),
      close: async () => {
        await browser.close()
        server.kill()
      },
    }
  } catch (error) {
    server.kill()
    throw error
  }
}

/**
 * The packaged game with a fresh user-data folder, as the packaged smoke test launches it. Its
 * window opens at 1280x720 (electron/main.cts) and loads the game by itself, so `startGame()` has
 * nothing left to do.
 */
export async function openElectronTarget(options) {
  const appData = mkdtempSync(join(tmpdir(), 'steampunk-miner-soak-'))
  const app = await electron.launch({
    executablePath: options.electronPath,
    args: [DEBUG_API_FLAG, ...MEASUREMENT_SWITCHES],
    env: { ...process.env, APPDATA: appData, XDG_CONFIG_HOME: appData },
  })
  try {
    return {
      kind: 'electron',
      page: await app.firstWindow(),
      startGame: async () => {},
      close: () => app.close(),
    }
  } catch (error) {
    await app.close()
    throw error
  }
}
