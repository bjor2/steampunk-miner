/**
 * Real sales for the sell burst's browser specs and review clips (#176): the slice's read-only
 * `haulScript(legs)` writes the scripted mining and the dock at the Exchange, the spec plays it
 * through `fastForward`, waits for the bay to open and sells, so the burst starts live.
 */
import { expect, type Page } from '@playwright/test'
import type { DebugApi } from '../../src/debug/debugApi'
import type { HaulPlan } from '../../src/features/sell-burst/debugHaul'

declare global {
  interface Window {
    steampunkDebug?: DebugApi
  }
}

/** What `steampunkDebug.features['sell-burst'].getBurst()` answers. */
export interface BurstReading {
  isRunning: boolean
  waves: number
  coins: number
  peeled: number
  landing: number
  landed: number
  chunks: number
  isFlare: boolean
  tagPhase: 'hidden' | 'shown' | 'fading'
  liningBilled: string | null
  shown: string
  wallet: string
  tick: number
}

export async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('/?debug')
  // The scene's burst piece hears the sales, so the game must be drawing before the spec sells.
  await page.waitForFunction(() => {
    const stats = window.steampunkDebug?.ui.getRenderStats()
    return stats?.ok === true && stats.stats.drawCalls > 0
  })
  return errors
}

export interface SalePlan {
  /** Each leg mines surface ore of its planet; the last leg's pad docks at the Exchange. */
  legs: HaulPlan
  /** Ore tiers sold one after another, `gapTicks` apart; `all` sells the hold at once. */
  sells: readonly ('all' | number)[]
  gapTicks?: number
  /** Undock this many ticks after the last sale, inside the burst. */
  undockAfterTicks?: number
}

type SellCommands = NonNullable<Parameters<DebugApi['fastForward']>[1]>[number][]

/**
 * Mines the haul and docks headlessly, waits for the Sell bay to open as a player would, then
 * plays the sales (and the undock) and reads the burst right after the last of them.
 */
export async function sellAtTheExchange(page: Page, plan: SalePlan): Promise<BurstReading> {
  await haulToTheExchange(page, plan.legs)
  await expect.poll(() => openBay(page), { timeout: 60_000 }).toBe('sell')
  return page.evaluate((sale) => {
    const debug = window.steampunkDebug!
    const read = () => debug.features['sell-burst'].getBurst() as unknown as BurstReading
    const first = read().tick + 1
    const gap = sale.gapTicks ?? 1
    const commands: SellCommands = sale.sells.map((resourceTier, index) => ({
      tick: first + index * gap,
      type: 'sellCargo',
      payload: { resourceTier },
    }))
    const lastSale = first + (sale.sells.length - 1) * gap
    if (sale.undockAfterTicks !== undefined) {
      commands.push({ tick: lastSale + sale.undockAfterTicks, type: 'undock', payload: {} })
    }
    const end = lastSale + (sale.undockAfterTicks ?? 0)
    const played = debug.fastForward(end - first + 1, commands)
    if (!played.ok) throw new Error(played.problems.join('; '))
    return read()
  }, plan)
}

async function haulToTheExchange(page: Page, legs: HaulPlan): Promise<void> {
  await page.evaluate((haul) => {
    const debug = window.steampunkDebug!
    const script = debug.features['sell-burst'].haulScript(haul) as unknown as
      { ok: true; commands: SellCommands; endTick: number } | { ok: false; problems: string[] }
    if (!script.ok) throw new Error(script.problems.join('; '))
    const tick = (debug.features['sell-burst'].getBurst() as unknown as BurstReading).tick
    const played = debug.fastForward(script.endTick - tick, script.commands)
    if (!played.ok) throw new Error(played.problems.join('; '))
  }, legs)
}

function openBay(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const result = window.steampunkDebug!.ui.getBayPresentation()
    if (!result.ok) return null
    return result.presentation.shutter.phase === 'open' ? result.presentation.shutter.bay : null
  })
}

export function readBurst(page: Page): Promise<BurstReading> {
  return page.evaluate(
    () => window.steampunkDebug!.features['sell-burst'].getBurst() as unknown as BurstReading,
  )
}
