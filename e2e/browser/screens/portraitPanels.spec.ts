/**
 * The panels held upright (#470 PT-5, ticket 487) in the matrix's portrait cells: the Sell and
 * Upgrade bays, the Upgrade bay's Outfitter sheet (#687), the settings, the pause and title
 * menus, the planet card and the Patent Office sheet (#687) each fit the safe area, with no text running out of
 * its panel sideways, no two targets on top of each other, nothing over a touch button or the
 * Tech tree button, and every target at least 48 px (a sheet card at least the 44 px of the GD
 * lock on #678). Geometry and state through the DOM and
 * `steampunkDebug`, never pixels.
 */
import { expect, test, type Page } from '@playwright/test'
import { TREE_TEST_IDS } from '../../../src/features/tech-tree/ui/nodeTestIds'
import { DESIGN_TOKENS } from '../../../src/systems/views/designSystem'
import { SHEET_UI_IDS } from '../../../src/ui/sheet/sheetIds'
import { UI_IDS } from '../../../src/ui/ids'
import {
  boxOf,
  currentCell,
  declaredHudBoxes,
  dockAt,
  openGame,
  overlaps,
  type Box,
} from './screenHelpers'

/** The smallest touch target on a panel (spec #470: "targets are at least 48 px"). */
const MIN_TARGET_PX = 48
/** A layout's rounding pixel. */
const SLACK_PX = 1
const PLANET_CARD = 'planet-card'
/** A planet whose card has a line to show on arrival (the magnetic class, ticket 289). */
const PLANET_WITH_CARD = 25

/** What one panel's DOM shows wrong: texts out of it sideways, small targets, stacked targets. */
interface PanelFindings {
  outside: string[]
  small: string[]
  stacked: string[]
}

test.beforeEach(() => {
  const cell = currentCell()
  test.skip(!cell.isTouch || !cell.isPortrait, 'these are the upright touch screens')
})

/**
 * The panel under `selector`: every visible text of its own sideways inside it (a carousel or a
 * map that pans past the screen is checked by its frame instead), every button, field and tab at
 * least 48 px both ways, and no two of them over each other where a finger reaches them: a target
 * scrolled out of its scroll area or under a sheet is judged by the part a tap can land on.
 */
function panelFindings(page: Page, selector: string, pannedTestIds: string[] = []) {
  return page.evaluate(
    ({ selector, pannedTestIds, minTarget, slack }): PanelFindings => {
      type Rect = { left: number; top: number; right: number; bottom: number }
      const panel = document.querySelector(selector)!
      const frame = panel.getBoundingClientRect()
      const isShown = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return (
          rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
        )
      }
      const isPanned = (element: Element) =>
        pannedTestIds.some((id) => element.closest(`[data-testid="${id}"]`) !== null)
      const hasOwnText = (element: Element) =>
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
        )
      const nameOf = (element: Element) =>
        element.getAttribute('data-testid') ?? (element.textContent ?? '').trim().slice(0, 30)
      const sizeOf = (element: Element) => {
        const { width, height } = element.getBoundingClientRect()
        return `${Math.round(width)}x${Math.round(height)}`
      }
      const clip = (a: Rect, b: Rect): Rect => ({
        left: Math.max(a.left, b.left),
        top: Math.max(a.top, b.top),
        right: Math.min(a.right, b.right),
        bottom: Math.min(a.bottom, b.bottom),
      })
      const screen: Rect = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
      /** The part of a target its scroll areas and the screen show; null when none does. */
      const reachableRectOf = (element: Element): Rect | null => {
        let rect: Rect = clip(element.getBoundingClientRect(), screen)
        for (let at = element.parentElement; at !== null; at = at.parentElement) {
          if (at.hasAttribute('data-scroll-area')) rect = clip(rect, at.getBoundingClientRect())
        }
        if (rect.right - rect.left < slack || rect.bottom - rect.top < slack) return null
        const hit = document.elementFromPoint(
          (rect.left + rect.right) / 2,
          (rect.top + rect.bottom) / 2,
        )
        return hit !== null && (hit === element || element.contains(hit)) ? rect : null
      }
      const all = [...panel.querySelectorAll('*')].filter(isShown)
      const outside = all
        .filter((element) => hasOwnText(element) && !isPanned(element))
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.left < frame.left - slack || rect.right > frame.right + slack
        })
        .map(nameOf)
      const targets = all.filter((element) =>
        element.matches('button, input, select, [role="tab"], [data-tap-exact]'),
      )
      const small = targets
        .filter((element) => !element.matches('[data-tap-exact]'))
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.width < minTarget - slack || rect.height < minTarget - slack
        })
        .map((element) => `${nameOf(element)} ${sizeOf(element)}`)
      const reachable = targets
        .map((element) => ({ element, rect: reachableRectOf(element) }))
        .filter((target): target is { element: Element; rect: Rect } => target.rect !== null)
      const stacked: string[] = []
      reachable.forEach((a, index) => {
        for (const b of reachable.slice(index + 1)) {
          if (a.element.contains(b.element) || b.element.contains(a.element)) continue
          const isOver =
            a.rect.left < b.rect.right - slack &&
            b.rect.left < a.rect.right - slack &&
            a.rect.top < b.rect.bottom - slack &&
            b.rect.top < a.rect.bottom - slack
          if (isOver) stacked.push(`${nameOf(a.element)} / ${nameOf(b.element)}`)
        }
      })
      return { outside, small, stacked }
    },
    { selector, pannedTestIds, minTarget: MIN_TARGET_PX, slack: SLACK_PX },
  )
}

function boxBySelector(page: Page, selector: string): Promise<Box> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect()
      return { left, top, right, bottom, width, height }
    })
}

function isInside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - SLACK_PX &&
    inner.top >= outer.top - SLACK_PX &&
    inner.right <= outer.right + SLACK_PX &&
    inner.bottom <= outer.bottom + SLACK_PX
  )
}

/** Which touch buttons, or the HUD's Tech tree button, the panel covers. */
async function coveredBy(page: Page, panel: Box): Promise<string[]> {
  const kept = (await declaredHudBoxes(page)).filter(
    (box) => box.id === 'control' || box.id === 'tech-tree',
  )
  return kept.filter((box) => overlaps(panel, box)).map((box) => box.testId || box.id)
}

async function expectPanelFits(page: Page, selector: string, panned: string[] = []) {
  const panel = await boxBySelector(page, selector)
  expect(isInside(panel, await boxOf(page, 'safe-area')), `${selector} in the safe area`).toBe(true)
  expect(await panelFindings(page, selector, panned)).toEqual({
    outside: [],
    small: [],
    stacked: [],
  })
  return panel
}

async function giveMoney(page: Page, amount: string): Promise<void> {
  await page.evaluate((money) => {
    const result = window.steampunkDebug!.giveMoney(money)
    if (!result.ok) throw new Error(result.problems.join('; '))
  }, amount)
}

/** A sheet the bay opened (the Outfitter, ticket 687) takes Escape first, so it is shut before. */
async function undock(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.steampunkDebug!.ui.closeSheet()
    window.steampunkDebug!.input.tap('ui_cancel')
  })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const result = window.steampunkDebug!.ui.getBayPresentation()
        return result.ok ? result.presentation.shutter.phase : 'closed'
      }),
    )
    .toBe('closed')
}

/** The HUD's tree button opens the base sheet on the Patent Office (ticket 687). */
async function openPatentOffice(page: Page): Promise<void> {
  await page.getByTestId('tech-tree-open').locator('button').tap()
  await expect(page.getByTestId(TREE_TEST_IDS.patentCards)).toBeVisible({ timeout: 30_000 })
}

test.describe('screen matrix: panels held upright (ticket 487)', () => {
  test('fits the Sell bay in the safe area in one column, off the touch buttons, with 48 px targets', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page, currentCell())
    await giveMoney(page, '1e9')
    await dockAt(page, 'sell')
    const panel = await expectPanelFits(page, `[data-testid="${UI_IDS.platformScreen}"]`)
    expect(await coveredBy(page, panel)).toEqual([])
    expect(errors).toEqual([])
  })

  test('opens the Outfitter as the full sheet on a dock at the Upgrade bay, each card a priced target (ticket 687)', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page, currentCell())
    await giveMoney(page, '1e9')
    await dockAt(page, 'upgrade')
    const sheet = `[data-testid="${SHEET_UI_IDS.baseSheet}"]`
    await expect(page.getByTestId(SHEET_UI_IDS.outfitterCards)).toBeVisible({ timeout: 30_000 })
    const frame = await boxBySelector(page, sheet)
    expect(frame.right).toBeLessThanOrEqual(currentCell().viewport.width + SLACK_PX)
    const cards = page.locator(`${sheet} [data-sheet-card]`)
    expect(await cards.count()).toBeGreaterThanOrEqual(8)
    for (const card of await cards.all()) {
      const box = (await card.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(DESIGN_TOKENS.layout.tapTargetMinPx - SLACK_PX)
    }
    await expect(page.getByTestId('workshop-upgrade-drill_tip-buy')).toContainText(/\d/)
    expect(errors).toEqual([])
  })

  test('fits the settings in one column with every Rebind in reach', async ({ page }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page, currentCell())
    await dockAt(page, 'sell')
    await page.getByTestId('platform-settings').tap()
    await expect(page.getByTestId(UI_IDS.settingsPanel)).toBeVisible()
    await expectPanelFits(page, `[data-testid="${UI_IDS.settingsPanel}"] > *`)
    expect(errors).toEqual([])
  })

  test('fits the pause menu, and the Ledger its Save game opens on the sheet', async ({ page }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page, currentCell())
    await undock(page)
    await page.evaluate(() => window.steampunkDebug!.input.tap('open_pause_menu'))
    const selector = `[data-testid="${UI_IDS.pauseMenu}"] > *`
    await expect(page.getByTestId(UI_IDS.pauseMenu)).toBeVisible()
    await expectPanelFits(page, selector)
    await page.getByText('Save game', { exact: true }).last().tap()
    // Ticket 688: the save page is the Ledger on the base sheet, and the pause plate gives way.
    await expect(page.getByTestId(UI_IDS.ledger)).toBeVisible()
    await expect(page.getByTestId(UI_IDS.pauseMenu)).toHaveCount(0)
    await expectPanelFits(page, `[data-testid="${SHEET_UI_IDS.baseSheet}"]`)
    expect(errors).toEqual([])
  })

  test('fits the title menu and the game name inside the screen', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/?debug&title')
    const title = page.getByTestId('title-menu')
    await expect(title).toBeVisible({ timeout: 60_000 })
    await expectPanelFits(page, '[data-testid="title-menu"] section')
    expect(
      isInside(
        await boxBySelector(page, '[data-testid="title-menu"] h1'),
        await boxOf(page, 'title-menu'),
      ),
    ).toBe(true)
  })

  test('shows the planet card in the safe area, off the Tech tree button', async ({ page }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page, currentCell())
    await page.evaluate((planet) => window.steampunkDebug!.setPlanet(planet), PLANET_WITH_CARD)
    await expect(page.getByTestId(PLANET_CARD)).toBeVisible({ timeout: 30_000 })
    const card = await expectPanelFits(page, `[data-testid="${PLANET_CARD}"]`)
    expect(await coveredBy(page, card)).toEqual([])
    expect(errors).toEqual([])
  })

  test('opens the Patent Office as the full sheet from the HUD button, each card a 44 px target', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = await openGame(page, currentCell())
    await giveMoney(page, '1e4')
    await openPatentOffice(page)
    const sheet = `[data-testid="${SHEET_UI_IDS.baseSheet}"]`
    const frame = await boxBySelector(page, sheet)
    expect(frame.right).toBeLessThanOrEqual(currentCell().viewport.width + SLACK_PX)
    const keepOut = (currentCell().viewport.height * DESIGN_TOKENS.layout.topKeepOutPercent) / 100
    expect((await boxBySelector(page, '[data-sheet-close]')).top).toBeGreaterThanOrEqual(keepOut)
    const cards = page.locator(`[data-testid="${TREE_TEST_IDS.patentCards}"] [data-sheet-card]`)
    expect(await cards.count()).toBeGreaterThan(0)
    for (const card of (await cards.all()).slice(0, 12)) {
      const box = (await card.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(DESIGN_TOKENS.layout.tapTargetMinPx - SLACK_PX)
    }
    expect(errors).toEqual([])
  })
})
