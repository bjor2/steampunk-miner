/**
 * The mobile Playwright projects (#470 P1-10, ticket 481; the TD's comment 6208729254, section 5):
 * the Producer's reference phones of #173 (iPhone 13 class 390x844@3, Pixel 7 class 412x915@2.625)
 * on Playwright's own device descriptors and engines, turned to landscape (the screen's sides
 * swapped), since pass 1 stays on the landscape layout (GD ruling 6208734423). Each project reads the
 * screen-matrix cell with the same screen, so the shared touch specs keep the cell's expectations;
 * the nine cells stay and carry the geometry numbers.
 *
 * All of it is emulation: Chromium's mobile mode and Playwright's WebKit build on software GL. No
 * spec here claims "verified on device"; that is the real-device check (#482, P1-11).
 */
import { existsSync } from 'node:fs'
import { chromium, devices, webkit } from '@playwright/test'
import { SCREEN_CELLS, type ScreenCell } from '../screens/screenCells'

export interface MobileDevice {
  project: string
  descriptor: 'Pixel 7' | 'iPhone 13'
  /** The screen-matrix cell with the same landscape screen. */
  cellName: string
}

export const MOBILE_DEVICES: readonly MobileDevice[] = [
  { project: 'mobile-chromium-pixel7', descriptor: 'Pixel 7', cellName: 'pixel-landscape' },
  { project: 'mobile-webkit-iphone13', descriptor: 'iPhone 13', cellName: 'phone-landscape' },
]

/** The project the CPU-throttled `perf:phone` lane runs on (Chromium: throttling is a CDP call). */
export const PERF_PHONE_PROJECT = 'mobile-chromium-pixel7'

/**
 * The specs the mobile projects run: this folder, and the screen matrix's touch specs (the stick's
 * action stream, the pause button, the charge size badge, slot holds, taps for cards and money).
 */
export const MOBILE_SPECS = [
  '**/browser/mobile/*.spec.ts',
  '**/browser/screens/touchControls.spec.ts',
  '**/browser/screens/tapAffordances.spec.ts',
  '**/browser/screens/slotHoldRing.spec.ts',
]

export const MOBILE_GLOB = '**/browser/mobile/**'

/**
 * The device descriptor on its own engine (user agent, scale, `isMobile`, `hasTouch`), its viewport
 * and screen the cell's: the whole reference screen turned to landscape.
 */
export function landscapeUseOf(device: MobileDevice) {
  const { viewport } = cellOfDevice(device)
  return { ...devices[device.descriptor], viewport, screen: viewport }
}

export function cellOfDevice(device: MobileDevice): ScreenCell {
  const cell = SCREEN_CELLS.find((candidate) => candidate.name === device.cellName)
  if (cell === undefined) throw new Error(`no screen cell named ${device.cellName}`)
  return cell
}

/** Whether this machine has the engine's browser (`npx playwright install webkit`). */
export function isEngineInstalled(browserName: string): boolean {
  const engine = browserName === 'webkit' ? webkit : chromium
  return existsSync(engine.executablePath())
}

export const ENGINE_MISSING_MESSAGE =
  'WebKit is not installed on this machine: run `npx playwright install webkit` to run the iPhone 13 project'
