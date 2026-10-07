/**
 * The Workshop showcase (#177, spec #180): read through `steampunkDebug.features.workshop`, the
 * authority snapshot and the bay's #33 ids, never pixels. A click on a plaque's Buy buys exactly
 * one step; holding the pointer on it chains steps until let go; `holdBuy` runs a 10-step chain
 * across a big level-up; a hold stops on can't afford with its cue; and the showcase keeps the
 * kernel rows' ids while the preview's second WebGL context stays unmounted.
 */
import { expect, test, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import { UPGRADE_IDS } from '../../src/systems/economy/economyDefinition'
import { UI_ID_TEMPLATES, UI_IDS } from '../../src/systems/views/screenIds'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

const SHOWCASE = '[data-slice-screen="workshop.showcase"]'

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

test.describe('workshop showcase (#177)', () => {
  test("a click on a plaque's Buy buys exactly one step", async ({ page }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page)
    await page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeBuy('engine')).click()

    expect((await chainOnceEnded(page)).tally).toMatchObject({ steps: 1, cue: 'ka_chunk' })
    expect(await stepOf(page, 'engine')).toBe(1)
    await expect(page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeLevel('engine'))).toHaveText(
      '0 · 1/9',
    )
    expect(errors).toEqual([])
  })

  test('holding the pointer on Buy chains steps until it is let go', async ({ page }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page)
    await page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeBuy('boiler')).hover()
    await page.mouse.down()
    await expect.poll(() => stepOf(page, 'boiler'), { timeout: 60_000 }).toBeGreaterThanOrEqual(4)
    await page.mouse.up()
    const reading = await chainOnceEnded(page)
    const bought = await stepOf(page, 'boiler')
    await page.waitForTimeout(2000)

    expect(reading.tally?.cue).toBe('ka_chunk')
    expect(await stepOf(page, 'boiler')).toBe(bought)
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
    await expect(page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeLevel('drill_power'))).toHaveText(
      '1',
    )
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

  test("keeps the bay rows' #33 ids and never mounts the preview's second WebGL context", async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openAtTheShowcase(page)
    for (const track of UPGRADE_IDS) {
      await expect(page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeBuy(track))).toBeVisible()
      await expect(page.getByTestId(UI_ID_TEMPLATES.workshopUpgradeCost(track))).toBeVisible()
    }
    await expect(page.getByTestId(UI_IDS.upgradebayCasingBuy)).toBeVisible()
    await expect(page.getByTestId(UI_IDS.upgradebayPreview)).toHaveCount(0)
    expect(await previewPanelHeight(page)).toBe(0)
    expect(errors).toEqual([])
  })
})
