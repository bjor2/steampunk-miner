/**
 * The packaged game runs on its own, with no Steam client (#2 done item 8, #12), and keeps the
 * debug API behind its launch flag (#11 section 6 and acceptance 7). Each launch gets a fresh
 * user-data folder, so the files it finds are the ones this launch wrote.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { CANVAS_DPR_RANGE } from '../../src/constants/scene'
import { renderScaleFloorOf } from '../../src/systems/render/renderScale'
import { maxViewShortAxisOf } from '../../src/systems/render/viewZoom'
import { screenLayoutOf } from '../../src/systems/views/screenLayout'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const RELEASE = fileURLToPath(new URL('../../release/', import.meta.url))
const SCENARIO_FILE = fileURLToPath(
  new URL('../../scenarios/planet1-start.scenario.json', import.meta.url),
)
/** The committed start scenario fast-forwards this far (its script). */
const SCENARIO_END_TICK = 7200
/** Chromium switches that give a headless or virtual display a software WebGL context. */
const SOFTWARE_GL_SWITCHES = [
  '--use-gl=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]

/** Where `electron-builder --dir` puts the game on this platform (electron-builder.yml). */
function packagedExecutable(): string {
  if (process.platform === 'win32') return join(RELEASE, 'win-unpacked', 'Steampunk Miner.exe')
  if (process.platform === 'darwin') {
    return join(
      RELEASE,
      'mac-universal',
      'Steampunk Miner.app',
      'Contents',
      'MacOS',
      'Steampunk Miner',
    )
  }
  return join(RELEASE, 'linux-unpacked', 'steampunk-miner')
}

interface Launched {
  app: ElectronApplication
  userData: string
}

/** A launch with its own empty user-data folder (appData moved to a temp folder). */
async function launchGame(args: string[] = []): Promise<Launched> {
  const appData = mkdtempSync(join(tmpdir(), 'steampunk-miner-'))
  const app = await electron.launch({
    executablePath: packagedExecutable(),
    args,
    env: { ...process.env, APPDATA: appData, XDG_CONFIG_HOME: appData },
  })
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
  return { app, userData }
}

function runFolders(userData: string): string[] {
  const logs = join(userData, 'logs')
  return existsSync(logs) ? readdirSync(logs).map((runId) => join(logs, runId)) : []
}

function metadataOf(userData: string): { debugEnabled: boolean } | null {
  const file = runFolders(userData)
    .map((folder) => join(folder, 'metadata.json'))
    .find((path) => existsSync(path))
  return file === undefined
    ? null
    : (JSON.parse(readFileSync(file, 'utf8')) as { debugEnabled: boolean })
}

function savesIn(userData: string, folder: string): string[] {
  const path = join(userData, folder)
  return existsSync(path) ? readdirSync(path) : []
}

test.describe('packaged build (#29 packaged-smoke)', () => {
  test('opens its window, writes its run log and keeps the debug API off by default', async () => {
    const { app, userData } = await launchGame()
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect.poll(() => runFolders(userData).length).toBeGreaterThan(0)
    await expect.poll(() => metadataOf(userData)).toMatchObject({ debugEnabled: false })
    expect(await page.evaluate(() => window.steampunkDebug === undefined)).toBe(true)
    await app.close()
  })

  test('with --debug-api, exposes the debug API, says so in the run and saves to saves-debug', async () => {
    const { app, userData } = await launchGame(['--debug-api'])
    const page = await app.firstWindow()
    await page.waitForFunction(() => window.steampunkDebug !== undefined)
    await expect.poll(() => metadataOf(userData)).toMatchObject({ debugEnabled: true })
    expect(await page.evaluate(() => window.steampunkDebug!.teleportToDock())).toEqual({
      ok: true,
    })
    await expect.poll(() => savesIn(userData, 'saves-debug').length).toBeGreaterThan(0)
    expect(savesIn(userData, 'saves')).toEqual([])
    await app.close()
  })

  test('starts a --scenario=<path> file only together with --debug-api', async () => {
    const { app } = await launchGame(['--debug-api', `--scenario=${SCENARIO_FILE}`])
    const page = await app.firstWindow()
    await page.waitForFunction(() => window.steampunkDebug !== undefined)
    const tick = await page.evaluate(() => {
      const snapshot = window.steampunkDebug!.snapshot()
      return snapshot.ok ? snapshot.snapshot.tick : -1
    })
    expect(tick).toBe(SCENARIO_END_TICK)
    await app.close()
  })

  test('fits its window as the browser fits the same window: UI scale, zoom cap, render floor (#173)', async () => {
    // The zoom cap and the render floor are read from drawn frames, so WebGL must start: under
    // Xvfb only SwiftShader gives it one (#102), and the switches are harmless elsewhere.
    const { app } = await launchGame(['--debug-api', ...SOFTWARE_GL_SWITCHES])
    const page = await app.firstWindow()
    await page.waitForFunction(() => window.steampunkDebug !== undefined)
    const screen = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
    }))
    const shortAxis = Math.min(screen.width, screen.height)
    const devicePixelRatio = Math.min(screen.devicePixelRatio, CANVAS_DPR_RANGE[1])
    const expected = {
      layout: screenLayoutOf(
        { widthPixels: screen.width, heightPixels: screen.height, isCoarsePointer: false },
        false,
      ),
      maxViewShortAxisMetres: maxViewShortAxisOf(screen.width, screen.height),
      renderScaleFloor: renderScaleFloorOf({
        cssPixels: shortAxis,
        devicePixels: shortAxis * devicePixelRatio,
      }),
    }
    await expect
      .poll(() =>
        page.evaluate(() => {
          const debug = window.steampunkDebug!
          const layout = debug.ui.getScreenLayout()
          const view = debug.ui.getCameraView()
          const stats = debug.ui.getRenderStats()
          if (!layout.ok || !view.ok || !stats.ok) return null
          return {
            layout: layout.layout,
            maxViewShortAxisMetres: view.view.maxViewShortAxisMetres,
            renderScaleFloor: stats.stats.renderScaleFloor,
          }
        }),
      )
      .toEqual(expected)
    await app.close()
  })
})
