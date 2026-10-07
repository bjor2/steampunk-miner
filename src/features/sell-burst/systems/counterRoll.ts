/**
 * The money counter's roll (#171 section 1, TD lock on #176): the wallet is authority state and
 * changes at once; the counter shows it less what has not landed yet, so it rolls from the old
 * wallet to the new as the coins land and ends exactly on the authority value. Only landing coins
 * move it; the coins the lining bill peels off never do (G&V on #176).
 *
 * All Money: a wave's net is its gross credits (the sum of `floorMilli` unit prices the authority
 * logged) less the bill, and the shown amount is the wallet less a `floorMilli` share of what is
 * still in flight. The kernel formats the result once.
 */
import {
  add,
  cmp,
  div,
  floorMilli,
  fromSafeInteger,
  mul,
  sub,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { BURST_TIMING, type BurstTiming } from './burstTiming'
import { landingCoinsOf, netOf, type BurstWave } from './burstWave'
import { waveFirstLandTickOf, type SellBurst } from './sellBurst'

/** What the counter shows at `tick`: the wallet less the burst's money still in flight. */
export function shownMoneyOf(wallet: Money, burst: SellBurst | null, tick: number): Money {
  if (burst === null) return wallet
  const shown = sub(wallet, unlandedMoneyOf(burst, tick))
  return cmp(shown, ZERO_MONEY) < 0 ? ZERO_MONEY : shown
}

/** The money the counter has still to roll through at `tick`. */
export function unlandedMoneyOf(burst: SellBurst, tick: number): Money {
  return burst.waves.reduce((total, wave) => add(total, unlandedOfWave(wave, tick)), ZERO_MONEY)
}

/** Everything the burst rolls the counter through: the sum of each wave's credits less its bill. */
export function rolledTotalOf(burst: SellBurst): Money {
  return burst.waves.reduce((total, wave) => add(total, netOf(wave)), ZERO_MONEY)
}

/** How many of the burst's counter coins have landed by `tick`. */
export function landedCoinsAt(burst: SellBurst, tick: number): number {
  return burst.waves.reduce((total, wave) => total + landedOfWave(wave, tick), 0)
}

/**
 * The tick the wave's `index`-th counter coin lands: the stream leaves the hang one after another
 * and the last arrives at the land tick (90).
 */
export function coinLandTickOf(
  wave: BurstWave,
  index: number,
  timing: BurstTiming = BURST_TIMING,
): number {
  const landing = landingCoinsOf(wave)
  const first = waveFirstLandTickOf(wave, timing)
  if (landing <= 1) return first
  const spread = wave.startTick + timing.coins.landTick - first
  return first + Math.floor((index * spread) / (landing - 1))
}

function landedOfWave(wave: BurstWave, tick: number): number {
  const landing = landingCoinsOf(wave)
  let landed = 0
  while (landed < landing && coinLandTickOf(wave, landed) <= tick) landed += 1
  return landed
}

/**
 * A wave whose coins all peeled (or the caps left none) still moves the counter, all at once when
 * its stream would have landed.
 */
function unlandedOfWave(wave: BurstWave, tick: number): Money {
  const landing = landingCoinsOf(wave)
  if (landing === 0) return tick < waveFirstLandTickOf(wave) ? netOf(wave) : ZERO_MONEY
  const unlanded = landing - landedOfWave(wave, tick)
  if (unlanded === 0) return ZERO_MONEY
  if (unlanded === landing) return netOf(wave)
  return floorMilli(div(mul(netOf(wave), fromSafeInteger(unlanded)), fromSafeInteger(landing)))
}
