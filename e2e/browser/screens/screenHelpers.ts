/**
 * What the screen-matrix specs share (#173, #179): opening the game in a cell, reading the debug
 * API, and measuring the DOM (boxes, font sizes, focus rings). Geometry and counts only, never
 * pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../../src/debug/debugApi'
import type { ScreenCell } from './screenCells'

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
