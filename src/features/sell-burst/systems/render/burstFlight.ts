/**
 * Where the burst's pieces are at a tick (#171 section 1), pure look maths: the ore chunks arc
 * from `sell.chute` up into the hopper crown, where the `sell.ticker` sign sits; the coins burst up
 * out of `sell.stack` and hang; then they ride in screen space to the money counter, or to the
 * `Lining −X` tag when the bill peels them off. Each function writes into the caller's point and
 * answers whether the piece shows, so a frame allocates nothing.
 */
import { BURST_TIMING } from '../burstTiming'
import { landingCoinsOf, type BurstWave } from '../burstWave'
import { coinLandTickOf } from '../counterRoll'

export interface FlightPoint {
  x: number
  y: number
}

/** How far a coin fans out sideways from the stack across the burst (m). */
const COIN_FAN_M = 1.6
/** The screen flight's bow upward, as a share of its length. */
const SCREEN_ARC_SHARE = 0.25

/**
 * The `index`-th of `count` chunks at `elapsed` ticks into its wave: launched one after another
 * over the spread, each on its own arc 4 to 6 m high, gone once it drops into the crown.
 */
export function chunkPointAt(
  index: number,
  count: number,
  elapsed: number,
  chute: FlightPoint,
  crown: FlightPoint,
  out: FlightPoint,
  timing = BURST_TIMING.chunks,
): boolean {
  const share =
    (elapsed - staggeredTick(index, count, timing.launchSpreadTicks)) / timing.flightTicks
  if (share < 0 || share >= 1) return false
  const arc = timing.arcLowM + (timing.arcHighM - timing.arcLowM) * spreadShare(index, count)
  out.x = chute.x + (crown.x - chute.x) * share
  out.y = chute.y + (crown.y - chute.y) * share + 4 * arc * share * (1 - share)
  return true
}

/**
 * The wave's `index`-th coin over the stack: it bursts up in its turn, rises, and hangs in a fan
 * until it leaves on its screen flight.
 */
export function stackCoinPointAt(
  wave: BurstWave,
  index: number,
  tick: number,
  stack: FlightPoint,
  out: FlightPoint,
  timing = BURST_TIMING,
): boolean {
  const { burstTick, burstSpreadTicks, riseTicks, riseM, flightTicks } = timing.coins
  const launch = wave.startTick + burstTick + staggeredTick(index, wave.coins, burstSpreadTicks)
  if (tick < launch || tick >= landTickOfCoin(wave, index, timing) - flightTicks) return false
  const rise = Math.min(1, (tick - launch) / riseTicks)
  const eased = 1 - (1 - rise) * (1 - rise)
  out.x = stack.x + COIN_FAN_M * (spreadShare(index, wave.coins) - 0.5) * eased
  out.y = stack.y + riseM * eased
  return true
}

/**
 * How far along its screen flight the wave's `index`-th coin is at `tick`, 0 to 1, or null while
 * it is not in the air. Coins below `landingCoinsOf` fly to the counter one after another; the
 * rest are peeled off together at the end of the hang and fly to the tag.
 */
export function screenFlightShareAt(
  wave: BurstWave,
  index: number,
  tick: number,
  timing = BURST_TIMING,
): number | null {
  const land = landTickOfCoin(wave, index, timing)
  const share = (tick - land + timing.coins.flightTicks) / timing.coins.flightTicks
  return share < 0 || share >= 1 ? null : share
}

/**
 * A point on the bowed screen path from `from` to `to`, eased so it leaves and lands softly. The
 * path bows up, or down when the screen has no room above it (the stack and the counter both sit
 * near the top), so a coin never leaves the screen.
 */
export function screenFlightPointAt(
  from: FlightPoint,
  to: FlightPoint,
  share: number,
  out: FlightPoint,
): FlightPoint {
  const eased = share * share * (3 - 2 * share)
  out.x = from.x + (to.x - from.x) * eased
  out.y = from.y + (to.y - from.y) * eased - screenBowOf(from, to) * Math.sin(Math.PI * share)
  return out
}

/** Pixels the path bows up at its middle; negative bows it down. */
function screenBowOf(from: FlightPoint, to: FlightPoint): number {
  const bow = SCREEN_ARC_SHARE * (Math.abs(to.x - from.x) + Math.abs(to.y - from.y))
  return Math.min(from.y, to.y) >= bow ? bow : -bow
}

/** Whether the wave's `index`-th coin is one the bill peeled off. */
export function isPeeledCoin(wave: BurstWave, index: number): boolean {
  return index >= landingCoinsOf(wave)
}

function landTickOfCoin(wave: BurstWave, index: number, timing: typeof BURST_TIMING): number {
  if (!isPeeledCoin(wave, index)) return coinLandTickOf(wave, index, timing)
  return wave.startTick + timing.lining.liningPeelTick + timing.coins.flightTicks
}

function staggeredTick(index: number, count: number, spreadTicks: number): number {
  return count <= 1 ? 0 : Math.floor((index * spreadTicks) / (count - 1))
}

/** 0 to 1 across the pieces, shuffled so neighbours launch on different arcs. */
function spreadShare(index: number, count: number): number {
  return count <= 1 ? 0.5 : ((index * 7) % count) / (count - 1)
}
