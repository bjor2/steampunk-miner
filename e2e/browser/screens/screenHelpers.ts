/**
 * What the screen-matrix specs share (#173, #179): opening the game in a cell, reading the debug
 * API, and measuring the DOM (boxes, font sizes, focus rings). Geometry and counts only, never
 * pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../../src/debug/debugApi'
import type { ScreenCell } from './screenCells'

/** Long enough on software GL to drive off the pad before drilling down. */
const DRIVE_OFF_PAD_MS = 6000

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** The cell this project runs, from its metadata in `playwright.config.ts`. */
export function currentCell(): ScreenCell {
  return test.info().project.metadata.cell as ScreenCell
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** Opens the debug build with enemies frozen and the cell's TV mode; collects every error. */
export async function openGame(page: Page, cell: ScreenCell): Promise<string[]> {
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
  await expect.poll(() => uiScaleOf(page)).toBeGreaterThanOrEqual(1)
  return errors
}

export function uiScaleOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getScreenLayout()
    return result.ok ? result.layout.uiScale : 0
  })
}

export function renderStats(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getRenderStats()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.stats
  })
}

export function cameraView(page: Page) {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getCameraView()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.view
  })
}

/** Until the zoom has eased and every visible chunk is built, the block count still moves. */
export async function settledStats(page: Page) {
  let previous = -1
  await expect
    .poll(
      async () => {
        const { groundBlocks } = await renderStats(page)
        const isSettled = groundBlocks > 0 && groundBlocks === previous
        previous = groundBlocks
        return isSettled
      },
      { timeout: 90_000, intervals: [1000] },
    )
    .toBe(true)
  return renderStats(page)
}

/** Docked at a bay with its screen open behind the shutter. */
export async function dockAt(page: Page, bay: 'sell' | 'upgrade'): Promise<void> {
  await page.evaluate((name) => {
    const result = window.steampunkDebug!.teleportToDock(name)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, bay)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const result = window.steampunkDebug!.ui.getBayPresentation()
          return result.ok ? result.presentation.shutter.phase : 'closed'
        }),
      { timeout: 30_000 },
    )
    .toBe('open')
}

export function boxOf(page: Page, testId: string): Promise<Box> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((element) => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect()
      return { left, top, right, bottom, width, height }
    })
}

/** Every visible button in the HUD and screens, with its box and id. */
export function buttonBoxes(page: Page): Promise<(Box & { id: string })[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="safe-area"] button')]
      .map((button) => {
        const { left, top, right, bottom, width, height } = button.getBoundingClientRect()
        const id = button.getAttribute('data-testid') ?? button.textContent ?? ''
        return { id, left, top, right, bottom, width, height }
      })
      .filter((box) => box.width > 0 && box.height > 0),
  )
}

/** The HUD's panels: the absolutely placed boxes its readouts sit in. */
export function hudPanelBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const panels = new Set<Element>()
    for (const element of document.querySelectorAll('[data-testid^="hud-"]')) {
      let panel: Element | null = element
      while (panel !== null && getComputedStyle(panel).position !== 'absolute') {
        panel = panel.parentElement
      }
      if (panel !== null) panels.add(panel)
    }
    return [...panels]
      .map((panel) => panel.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map(({ left, top, right, bottom, width, height }) => ({
        left,
        top,
        right,
        bottom,
        width,
        height,
      }))
  })
}

/** A box the HUD declares (`data-hud`, #500): its id, its test id and where it is. */
export interface HudBox extends Box {
  id: string
  testId: string
}

/**
 * Every box the HUD declares with `data-hud` (#500's one list), the touch buttons (`control`)
 * included. Unlike `hudPanelBoxes` it holds on the compact HUD, whose boxes are grid cells.
 */
export function declaredHudBoxes(page: Page): Promise<HudBox[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-hud]')]
      .map((element) => {
        const { left, top, right, bottom, width, height } = element.getBoundingClientRect()
        const id = element.getAttribute('data-hud') ?? ''
        const testId = element.getAttribute('data-testid') ?? ''
        return { id, testId, left, top, right, bottom, width, height }
      })
      .filter((box) => box.width > 0 && box.height > 0),
  )
}

/** The HUD's own boxes: every declared box but the touch buttons. */
export async function hudBoxesBesideControls(page: Page): Promise<HudBox[]> {
  return (await declaredHudBoxes(page)).filter((box) => box.id !== 'control')
}

export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/**
 * The font size of every visible element in the HUD and screens that holds text of its own, keyed
 * by its place in the tree and its text, so two measurements of the same screen line up.
 */
export function textSizes(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const sizes: Record<string, number> = {}
    const hasOwnText = (element: Element) =>
      [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
      )
    const isShown = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
    }
    const walk = (element: Element, path: string) => {
      ;[...element.children].forEach((child, index) => {
        const place = `${path}/${child.tagName}${index}`
        if (hasOwnText(child) && isShown(child)) {
          const key = `${place}|${(child.textContent ?? '').trim().slice(0, 40)}`
          sizes[key] = Number.parseFloat(getComputedStyle(child).fontSize)
        }
        walk(child, place)
      })
    }
    walk(document.querySelector('[data-testid="safe-area"]')!, '')
    return sizes
  })
}

export function shortAxisOf(cell: ScreenCell): number {
  return Math.min(cell.viewport.width, cell.viewport.height)
}

/** On P1 with a drill that cuts at once and nothing to fight: off the pad, then down, held. */
export async function startDiggingDown(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = window.steampunkDebug!
    debug.setPlanet(1)
    for (const track of ['drill_power', 'drill_tip', 'engine']) debug.setUpgrade(track, 300)
    debug.freezeEnemies(true)
    debug.ui.setZoom(12)
    debug.input.press('aim_right')
  })
  await page.waitForTimeout(DRIVE_OFF_PAD_MS)
  await page.evaluate(() => {
    window.steampunkDebug!.input.release('aim_right')
    window.steampunkDebug!.input.press('aim_down')
  })
}

/** What a screen shows out of place: findings by name, every list empty when the layout holds. */
export interface LayoutFindings {
  /** A turn-your-device card (#173's, retired by ticket 483) covering the game. */
  cards: number
  /** Two HUD boxes over each other. */
  hudOverlaps: string[]
  /** A touch control past the safe area's edge. */
  controlsOutside: string[]
  /** A touch control over another or over a HUD box. */
  controlOverlaps: string[]
}

/** The layout rows of the matrix (#470 PT-6): no card, the HUD apart, the controls placed. */
export async function layoutFindingsOf(page: Page): Promise<LayoutFindings> {
  const safe = await boxOf(page, 'safe-area')
  const boxes = await declaredHudBoxes(page)
  const controls = boxes.filter((box) => box.id === 'control')
  const hud = boxes.filter((box) => box.id !== 'control')
  return {
    cards: await page.getByTestId('portrait-card').count(),
    hudOverlaps: overlappingPairsOf(hud),
    controlsOutside: controls.filter((box) => !isBoxInside(box, safe)).map(nameOfHudBox),
    controlOverlaps: [...overlappingPairsOf(controls), ...overlappingPairsAcross(controls, hud)],
  }
}

export const NO_LAYOUT_FINDINGS: LayoutFindings = {
  cards: 0,
  hudOverlaps: [],
  controlsOutside: [],
  controlOverlaps: [],
}

/** Each pair of the list once. */
function overlappingPairsOf(boxes: readonly HudBox[]): string[] {
  return boxes.flatMap((box, index) => overlappingPairsAcross([box], boxes.slice(index + 1)))
}

/** Touching edges and sub-pixel layout are not overlap. */
function overlappingPairsAcross(boxes: readonly HudBox[], others: readonly HudBox[]): string[] {
  return boxes.flatMap((box) =>
    others
      .filter((other) => overlaps(shavedBox(box), other))
      .map((other) => `${nameOfHudBox(box)} x ${nameOfHudBox(other)}`),
  )
}

function shavedBox(box: HudBox): HudBox {
  const shave = 0.5
  return {
    ...box,
    left: box.left + shave,
    top: box.top + shave,
    right: box.right - shave,
    bottom: box.bottom - shave,
  }
}

function isBoxInside(inner: Box, outer: Box): boolean {
  const slack = 1
  return (
    inner.left >= outer.left - slack &&
    inner.top >= outer.top - slack &&
    inner.right <= outer.right + slack &&
    inner.bottom <= outer.bottom + slack
  )
}

function nameOfHudBox(box: HudBox): string {
  return `${box.id}:${box.testId}`
}
