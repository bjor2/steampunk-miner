/**
 * The sell burst (#176, spec #171): read through `steampunkDebug.features['sell-burst']`, the
 * bay header's money counter and the lining tag's ids, never pixels. A real sale starts the burst,
 * its lining bill peels coins off to the `Lining −X` tag, and the counter ends on the authority
 * wallet; undocking at the burst's first tick is accepted and the coins still land; a 40-coin burst
 * with the gold flare adds at most two draw calls.
 */
import { expect, test, type Page } from '@playwright/test'
import { UI_IDS } from '../../src/systems/views/screenIds'
import { openGame, readBurst, sellAtTheExchange, type BurstReading } from './sellBurstSales'

const LINING_TAG = 'sell-burst-lining-tag'
const EXTRA_DRAWS = 2
/** About the burst's first second at the box's software-WebGL frame rate. */
const SAMPLED_FRAMES = 20

async function burstOnceOver(page: Page): Promise<BurstReading> {
  await expect.poll(async () => (await readBurst(page)).isRunning, { timeout: 60_000 }).toBe(false)
  return readBurst(page)
}

/** The tag's text and exact amount in one read, since it fades within seconds. */
function liningTagReading(page: Page): Promise<{ text: string; exact: string | null } | null> {
  return page.evaluate((testId) => {
    const tag = document.querySelector(`[data-testid="${testId}"]`)
    return tag === null
      ? null
      : { text: tag.textContent ?? '', exact: tag.getAttribute('data-exact') }
  }, LINING_TAG)
}

/** The most draw calls of `frames` rendered frames, read through the debug API each frame. */
function mostDrawCallsOver(page: Page, frames: number): Promise<number> {
  return page.evaluate(async (count) => {
    let most = 0
    for (let frame = 0; frame < count; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const result = window.steampunkDebug!.ui.getRenderStats()
      if (result.ok) most = Math.max(most, result.stats.drawCalls)
    }
    return most
  }, frames)
}

function vehicleMode(page: Page): Promise<string> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.snapshot()
    if (!result.ok) throw new Error(result.problems.join('; '))
    const state = result.snapshot.state as {
      players: Record<string, { vehicle: { mode: string } }>
    }
    return Object.values(state.players)[0].vehicle.mode
  })
}

test.describe('sell burst (#176)', () => {
  test('a sale starts the burst, its bill shows on the lining tag and the counter ends on the wallet', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openGame(page)
    const sold = await sellAtTheExchange(page, { legs: [{ planet: 1, tiles: 4 }], sells: ['all'] })
    expect(sold.isRunning).toBe(true)
    expect(sold.coins).toBeGreaterThanOrEqual(3)
    expect(sold.peeled).toBeGreaterThanOrEqual(1)
    expect(sold.landing + sold.peeled).toBe(sold.coins)
    expect(sold.shown).not.toBe(sold.wallet)
    await expect
      .poll(() => liningTagReading(page), { timeout: 60_000 })
      .toEqual({ text: expect.stringContaining('Lining −'), exact: sold.liningBilled })
    const over = await burstOnceOver(page)
    expect(over.shown).toBe(over.wallet)
    await expect(page.getByTestId(UI_IDS.platformMoney)).not.toHaveAttribute('data-shown')
    await expect(page.getByTestId(LINING_TAG)).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('undocking at the first tick of a burst is accepted and its coins still land', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const errors = await openGame(page)
    const sold = await sellAtTheExchange(page, {
      legs: [{ planet: 1, tiles: 4 }],
      sells: ['all'],
      undockAfterTicks: 1,
    })
    expect(sold.isRunning).toBe(true)
    expect(await vehicleMode(page)).not.toBe('docked')
    const over = await burstOnceOver(page)
    expect(over.shown).toBe(over.wallet)
    expect(errors).toEqual([])
  })

  test('a 40-coin burst lights the flare and adds at most two draw calls', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = await openGame(page)
    const sold = await sellAtTheExchange(page, { legs: [{ planet: 8, tiles: 4 }], sells: ['all'] })
    expect(sold.coins).toBe(40)
    expect(sold.isFlare).toBe(true)
    const during = await mostDrawCallsOver(page, SAMPLED_FRAMES)
    await burstOnceOver(page)
    const after = await mostDrawCallsOver(page, SAMPLED_FRAMES)
    expect(sold.chunks).toBeGreaterThan(0)
    expect(during - after).toBeLessThanOrEqual(EXTRA_DRAWS)
    expect(errors).toEqual([])
  })

  test('a second sale within 1.5 s merges into the running burst', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = await openGame(page)
    const sold = await sellAtTheExchange(page, {
      legs: [
        { planet: 1, tiles: 2 },
        { planet: 2, tiles: 2 },
      ],
      sells: [1, 4],
      gapTicks: 30,
    })
    expect(sold.waves).toBe(2)
    const over = await burstOnceOver(page)
    expect(over.shown).toBe(over.wallet)
    expect(errors).toEqual([])
  })
})
