/**
 * What the compact HUD spec (#500) measures: every `data-hud` box, the stick zone, the touch
 * buttons, the vehicle's body on screen, the hint chip, and the text inside each box. Geometry
 * read through the DOM and `steampunkDebug`, never pixels.
 */
import { expect, type Page } from '@playwright/test'
import type { DebugApi } from '../../../src/debug/debugApi'
import type { ScreenBox } from '../../../src/systems/views/hudClearView'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

export interface HudLayoutCell {
  name: string
  viewport: { width: number; height: number }
  isTouch: boolean
  isTvMode: boolean
  /** The clear-view floor the cell asserts (GD ruling 2), or null where it is only logged. */
  floor: number | null
}

export interface MeasuredBox extends ScreenBox {
  id: string
  testId: string | null
}

/** A layout's rounding pixel: touching edges and sub-pixel layout are not overlap. */
export const SLACK_PX = 0.5

/** Opens the debug build with enemies frozen and the cell's TV mode; collects every error. */
export async function openGame(page: Page, cell: HudLayoutCell): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((isTvMode) => {
    const debug = window.steampunkDebug!
    debug.freezeEnemies(true)
    debug.ui.setPref('tvMode', isTvMode)
  }, cell.isTvMode)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.hudDensity ?? ''))
    .not.toBe('')
  return errors
}

/**
 * The worst case the GD names: the opening transmission taken down by a key, the touch controls
 * up again by a touch, the rig driven off the dock pad and drilling down, the hold full, a threat
 * marker and its status, the cargo hint up and the Tech tree button shown. A cell that cannot
 * get there fails here.
 */
export async function reachWorstCase(page: Page, cell: HudLayoutCell): Promise<void> {
  await page.keyboard.press('KeyH')
  if (cell.isTouch) await page.touchscreen.tap(cell.viewport.width / 2, cell.viewport.height / 2)
  await pressAction(page, 'aim_right', DRIVE_OFF_PAD_MS)
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    for (const result of [
      debug.ui.stageHud({ isCargoFull: true, threatOctant: 2 }),
      debug.input.press('aim_down'),
    ]) {
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  })
  await expect
    .poll(() => depthTilesOf(page), { message: 'the rig drills down', timeout: DRILL_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(DRILLED_TILES)
  await showCargoHint(page)
  await expect(page.getByTestId('tech-tree-open')).toBeVisible()
  await expect(page.locator('[data-hud="threat"]')).toHaveCount(1)
}

/** Off the pad, which the drill does not cut, onto open ground (as the drill-down run does). */
const DRIVE_OFF_PAD_MS = 3000
/** Two tiles down is drilling; software WebGL on a loaded box is slow, so the wait is long. */
const DRILLED_TILES = 2
const DRILL_TIMEOUT_MS = 60_000

async function pressAction(page: Page, actionId: string, holdMs: number): Promise<void> {
  await page.evaluate((id) => window.steampunkDebug!.input.press(id), actionId)
  await page.waitForTimeout(holdMs)
  await page.evaluate((id) => window.steampunkDebug!.input.release(id), actionId)
}

function depthTilesOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getHudModel()
    return result.ok ? result.model.depth.depthTiles : 0
  })
}

/**
 * The stacked case the GD logged on #500 (ruling 2): every touch control the debug build can own
 * at once (five slotted power-ups, the bore gun's fire tile, the guns, the charge rack) and three
 * status chips (hull critical, critical energy, the staged threat) over the full hold.
 */
export async function stackEveryControl(page: Page): Promise<void> {
  await page.evaluate((powerUps) => {
    const debug = window.steampunkDebug!
    const slots = Object.fromEntries(powerUps.map((id, index) => [`powerup.${index + 1}`, id]))
    for (const result of [
      debug.setVehicleLoadout(slots),
      debug.features['ground-gun'].setLevels(1, 1, 1) as { ok: boolean; problems?: string[] },
      debug.setGunLevel(10),
      debug.setCharges(2, 1),
      debug.setHull('1'),
      debug.setEnergy('1'),
    ]) {
      if (!result.ok) throw new Error((result.problems ?? []).join('; '))
    }
  }, STACKED_POWER_UPS)
}

/** Five shipped power-ups, one a slot. */
const STACKED_POWER_UPS = [
  'power.steam_shield',
  'power.grav_anchor',
  'power.ore_shifter',
  'power.resonance_whistle',
  'power.phase_lantern',
]

/** Puts the cargo hint up; the compact HUD shows it once it has measured room. */
export async function showCargoHint(page: Page): Promise<void> {
  await page.evaluate(() => {
    const result = window.steampunkDebug!.ui.showHint('hint_cargo')
    if (!result.ok) throw new Error(result.problems.join('; '))
  })
}

export function hudBoxes(page: Page): Promise<MeasuredBox[]> {
  return measuredBoxes(page, '[data-hud]', 'data-hud')
}

export async function stickZone(page: Page): Promise<MeasuredBox | null> {
  const [zone] = await measuredBoxes(page, '[data-hud-zone]', 'data-hud-zone')
  return zone ?? null
}

function measuredBoxes(page: Page, selector: string, attribute: string): Promise<MeasuredBox[]> {
  return page.evaluate(
    ({ selector, attribute }) =>
      [...document.querySelectorAll(selector)]
        .map((element) => {
          const { left, top, right, bottom } = element.getBoundingClientRect()
          const id = element.getAttribute(attribute) ?? ''
          return { id, testId: element.getAttribute('data-testid'), left, top, right, bottom }
        })
        .filter((box) => box.right > box.left && box.bottom > box.top),
    { selector, attribute },
  )
}

/** Each pair of `data-hud` boxes that share area, a box and its own ancestor excepted. */
export function overlappingPairs(page: Page): Promise<string[]> {
  return page.evaluate((slack) => {
    const elements = [...document.querySelectorAll('[data-hud]')].filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    const nameOf = (element: Element) =>
      `${element.getAttribute('data-hud')}:${element.getAttribute('data-testid') ?? ''}`
    const pairs: string[] = []
    elements.forEach((a, index) => {
      for (const b of elements.slice(index + 1)) {
        if (a.contains(b) || b.contains(a)) continue
        const [p, q] = [a.getBoundingClientRect(), b.getBoundingClientRect()]
        const isOverlap =
          p.left + slack < q.right &&
          q.left + slack < p.right &&
          p.top + slack < q.bottom &&
          q.top + slack < p.bottom
        if (isOverlap) pairs.push(`${nameOf(a)} x ${nameOf(b)}`)
      }
    })
    return pairs
  }, SLACK_PX)
}

/**
 * Every visible element holding text of its own that spills out of its `data-hud` box or out of
 * its own box. The hint chip's one line is cut with an ellipsis by design (its card shows it
 * whole), and a title kept for assistive tech is clipped out of sight; neither is checked.
 */
export function spilledTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const spills: string[] = []
    const hasOwnText = (element: Element) =>
      [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
      )
    for (const box of document.querySelectorAll('[data-hud]')) {
      if (box.getAttribute('data-hud') === 'hint') continue
      const outer = box.getBoundingClientRect()
      for (const element of box.querySelectorAll('*')) {
        if (!hasOwnText(element) || getComputedStyle(element).clipPath !== 'none') continue
        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        const html = element as HTMLElement
        const isInside =
          rect.left >= outer.left - 1 &&
          rect.top >= outer.top - 1 &&
          rect.right <= outer.right + 1 &&
          rect.bottom <= outer.bottom + 1
        const isBlock = html.clientWidth > 0
        const fits =
          !isBlock ||
          (html.scrollWidth <= html.clientWidth + 1 && html.scrollHeight <= html.clientHeight + 1)
        if (!isInside || !fits) spills.push(`${box.getAttribute('data-hud')}: ${html.textContent}`)
      }
    }
    return spills
  })
}

/**
 * The slices' `gauges` panels (ticket 716): on the full HUD each places itself and carries no
 * `data-hud`, so they are measured as the children of their slot's layer; on the compact HUD the
 * tray is their one `panels` box.
 */
export function gaugePanelBoxes(page: Page): Promise<MeasuredBox[]> {
  return measuredBoxes(page, '[data-panel-slot="gauges"]:not([data-hud]) > *', 'data-testid')
}

/**
 * The 2 s hazard strip as drawn (ticket 341): its track and every pip shown on it, as one box, or
 * null while it is hidden. The strip itself is a zero-size anchor.
 */
export function hazardStripBox(page: Page): Promise<ScreenBox | null> {
  return page.evaluate(() => {
    const strip = document.querySelector('[data-testid="hud-hazard-strip"]:not([hidden])')
    if (strip === null) return null
    const parts = [...strip.querySelectorAll('*')]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
    if (parts.length === 0) return null
    return {
      left: Math.min(...parts.map((rect) => rect.left)),
      top: Math.min(...parts.map((rect) => rect.top)),
      right: Math.max(...parts.map((rect) => rect.right)),
      bottom: Math.max(...parts.map((rect) => rect.bottom)),
    }
  })
}

export async function vehicleBox(page: Page): Promise<ScreenBox> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getVehicleScreenBox()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.box
  })
}

export function boxOfTestId(page: Page, testId: string): Promise<ScreenBox> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect()
      return { left, top, right, bottom }
    })
}

export function isInside(inner: ScreenBox, outer: ScreenBox): boolean {
  return (
    inner.left >= outer.left - 1 &&
    inner.top >= outer.top - 1 &&
    inner.right <= outer.right + 1 &&
    inner.bottom <= outer.bottom + 1
  )
}
