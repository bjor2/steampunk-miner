/**
 * The Workshop showcase (#177, spec #180) with what it sells on the Outfitter (spec #678, ticket
 * 687): read through `steampunkDebug`, the authority snapshot and the bay's #33 buy ids, never
 * pixels. Docking opens the base sheet on the Outfitter, beside the car on desktop; a click on a
 * card buys exactly one step; a card the wallet is short for is greyed and buys nothing;
 * `holdBuy` still runs a 10-step chain across a big level-up and a hold stops on can't afford with
 * its cue; and the preview's second WebGL context never mounts. On touch a card's first tap shows
 * its gain text and buys nothing, the second buys one step.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { UPGRADE_IDS } from '../../src/systems/economy/economyDefinition'
import { UI_ID_TEMPLATES, UI_IDS } from '../../src/systems/views/screenIds'
import { SHEET_UI_IDS } from '../../src/ui/sheet/sheetIds'
import { WORKSHOP_TEST_IDS } from '../../src/features/workshop/ui/testIds'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const SHOWCASE = '[data-slice-screen="workshop.showcase"]'
const OUTFITTER_TAB_ID = 'workshop.outfitter'

interface ChainReading {
  hold: { upgradeId: string; steps: number; end: string | null } | null
  tally: { steps: number; cue: string | null } | null
}

async function openAtTheShowcase(page: Page, money = '1e9'): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  await page.waitForFunction(() => window.steampunkDebug !== undefined)
  await page.evaluate((amount) => {
    const debug = window.steampunkDebug!
    for (const result of [debug.giveMoney(amount), debug.teleportToDock('upgrade')]) {
      if (!result.ok) throw new Error(result.problems.join('; '))
    }
  }, money)
  await expect(page.locator(SHOWCASE)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId(SHEET_UI_IDS.outfitterCards)).toBeVisible({ timeout: 30_000 })
  return errors
}

function stepOf(page: Page, track: string): Promise<number> {
  return page.evaluate((upgradeId) => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const state = result.snapshot.state as {
      players: Record<string, { vehicle: { levels: Record<string, number> } }>
    }
    return Object.values(state.players)[0].vehicle.levels[upgradeId]
  }, track)
}

function openSheetTabOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getSheet()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.sheet.openTabId
  })
}

function previewPanelHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getBayPresentation()
    if (!result.ok) throw new Error(result.problems.join('; '))
    return result.presentation.preview.panelHeightPixels
  })
}

function chainNow(page: Page): Promise<ChainReading> {
  return page.evaluate(() => {
    const workshop = window.steampunkDebug!.features.workshop
    return workshop.getChain() as unknown as ChainReading
  })
}

async function chainOnceEnded(page: Page): Promise<ChainReading> {
  await expect
    .poll(async () => (await chainNow(page)).hold?.end ?? null, { timeout: 120_000 })
    .not.toBeNull()
  return chainNow(page)
}

test.describe('workshop showcase (#177) and its Outfitter (ticket 687)', () => {
  test('docking opens the sheet on the Outfitter, and undocking shuts it', async ({ page }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page)
    expect(await openSheetTabOf(page)).toBe(OUTFITTER_TAB_ID)
    await page.getByTestId(UI_IDS.platformUndock).click()
    await expect.poll(() => openSheetTabOf(page), { timeout: 30_000 }).toBeNull()
    expect(errors).toEqual([])
  })

  test("a click on a track's card buys exactly one step", async ({ page }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page)
    const engine = page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeBuy('engine'))
    await expect(engine.locator('[data-sheet-card-line]')).toContainText('% top speed')
    await engine.click()
    await expect.poll(() => stepOf(page, 'engine'), { timeout: 30_000 }).toBe(1)
    await page.waitForTimeout(1000)
    expect(await stepOf(page, 'engine')).toBe(1)
    expect(errors).toEqual([])
  })

  test('greys a card the wallet is short for, and buys nothing on its press', async ({ page }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page, '0')
    const boiler = page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeBuy('boiler'))
    await expect(boiler).toHaveAttribute('data-muted', 'true')
    await boiler.click()
    await page.waitForTimeout(1000)
    expect(await stepOf(page, 'boiler')).toBe(0)
    expect(errors).toEqual([])
  })

  test('Escape shuts the sheet over the dock, and the bay’s button opens it again', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page)
    await page.evaluate(() => window.steampunkDebug!.input.tap('ui_cancel'))
    await expect.poll(() => openSheetTabOf(page)).toBeNull()
    await expect(page.locator(SHOWCASE)).toBeVisible()
    await page.getByTestId(WORKSHOP_TEST_IDS.openOutfitter).click()
    await expect.poll(() => openSheetTabOf(page)).toBe(OUTFITTER_TAB_ID)
    expect(errors).toEqual([])
  })

  test('holdBuy runs a 10-step chain across a big level-up and ends on its release', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const errors = await openAtTheShowcase(page)
    await page.evaluate(() => window.steampunkDebug!.features.workshop.holdBuy('drill_power', 10))
    const reading = await chainOnceEnded(page)

    expect(reading.hold).toMatchObject({ upgradeId: 'drill_power', steps: 10, end: 'release' })
    expect(await stepOf(page, 'drill_power')).toBe(10)
    expect(errors).toEqual([])
  })

  test("a hold stops on can't afford with the soft clunk, keeping what it bought", async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page, '20')
    await page.evaluate(() => window.steampunkDebug!.features.workshop.holdBuy('drill_tip', 50))
    const reading = await chainOnceEnded(page)

    expect(reading.hold?.end).toBe('refused')
    expect(reading.tally?.cue).toBe('empty_clunk')
    expect(await stepOf(page, 'drill_tip')).toBe(reading.tally?.steps)
    expect(errors).toEqual([])
  })

  test("carries the bay's buy ids on the cards and never mounts the preview's WebGL context", async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page)
    for (const track of UPGRADE_IDS) {
      await expect(page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeBuy(track))).toBeAttached()
    }
    await expect(page.getByTestId(UI_IDS.upgradebayCasingBuy)).toBeAttached()
    await expect(page.getByTestId(UI_IDS.workshopRepair)).toBeAttached()
    expect(await previewPanelHeight(page)).toBe(0)
    expect(errors).toEqual([])
  })
})

test.describe('the Outfitter on touch (ticket 687, card rules of #686)', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 640 } })

  test("a first tap shows a card's gain text and buys nothing; the second buys one step", async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const errors = await openAtTheShowcase(page)
    const tip = page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeBuy('drill_tip'))
    await tip.tap()
    await expect(tip).toHaveAttribute('data-revealed', 'true', { timeout: 15_000 })
    expect(await stepOf(page, 'drill_tip')).toBe(0)
    await tip.tap()
    await expect.poll(() => stepOf(page, 'drill_tip'), { timeout: 30_000 }).toBe(1)
    expect(errors).toEqual([])
  })
})
