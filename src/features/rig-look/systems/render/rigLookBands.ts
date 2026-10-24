/**
 * The power-decade band rule (ticket 809, LK1; VS ruling of 24 Oct 14:58 via Systems, GD lock of
 * 24 Oct 14:54 on #647): every look line but the tender changes look once a band, and a band is
 * `step` purchases wide,
 *
 *   step = max(1, min(decade step, median buys of the line over 2 planets on the bot path))
 *
 * where the decade step is the purchases that raise the line's power tenfold, ceil(ln 10 / ln r)
 * levels of its own ratio `r` (engine: its speed term, never thrust-to-weight). Band b starts at
 * b x step purchases, for every b from 1, so the look depends on the level alone. The authored
 * ladder's edges are the first bands' starts, frozen as data to about P40; past the art the look is
 * a finish cycled once a band plus pips counting decades of power, `floor(band start / decade
 * step)`. Integer maths only: the decade step is found with bigints from the ratio's decimal text,
 * never a float power or logarithm, so every client agrees at any level.
 */

/** A decimal ratio above 1 as a fraction of two bigints: `1.243` is 1243 / 1000. */
interface RatioFraction {
  numerator: bigint
  denominator: bigint
}

const DECIMAL_RATIO = /^(\d+)(?:\.(\d+))?$/
/** No line's ratio is so close to 1 that a tenfold rise takes more levels than this. */
const DECADE_LEVELS_MAX = 100_000

/**
 * The purchases that raise a line's power tenfold: the least k with r^k >= 10, times the purchases
 * a level takes (10 on a two-tier track, whose ratio is per major level; 1 per purchase).
 */
export function decadeStepOf(ratio: string, purchasesPerLevel: number): number {
  return decadeLevelsOf(ratioFractionOf(ratio)) * purchasesPerLevel
}

/** The VS step rule: the decade step, or fewer when the bot buys fewer over 2 planets; 1 at least. */
export function bandStepOf(decadeStep: number, twoPlanetBuys: number): number {
  return Math.max(1, Math.min(decadeStep, twoPlanetBuys))
}

/**
 * The median, over every run and every two neighbouring planets of it, of the line's purchases on
 * those two planets; `runs[r][p]` is run r's purchases on planet p + 1. An even count of windows
 * takes the lower middle's and the upper middle's mean, rounded down.
 */
export function medianTwoPlanetBuysOf(runs: readonly (readonly number[])[]): number {
  const windows = runs.flatMap(twoPlanetWindowsOf).sort((a, b) => a - b)
  if (windows.length === 0) return 0
  const middle = Math.floor(windows.length / 2)
  if (windows.length % 2 === 1) return windows[middle]
  return Math.floor((windows[middle - 1] + windows[middle]) / 2)
}

/** The band `purchases` sit in: 0 below the first edge, then one more each `step`. */
export function bandAt(step: number, purchases: number): number {
  return Math.floor(purchases / step)
}

/** The purchase count band `band` starts at. */
export function bandStartOf(step: number, band: number): number {
  return band * step
}

/** Whole decades of power at a count: the pips a finish band shows. */
export function decadesAt(decadeStep: number, purchases: number): number {
  return Math.floor(purchases / decadeStep)
}

/** The pips band `band` shows: the decades of power at its start. */
export function bandPipsOf(step: number, decadeStep: number, band: number): number {
  return decadesAt(decadeStep, bandStartOf(step, band))
}

/**
 * The fewest finishes a cycle needs so no two bands of a line share a finish and a pip count:
 * bands that share a finish are a cycle apart, so their starts must be a decade apart.
 */
export function finishesNeededOf(step: number, decadeStep: number): number {
  return Math.max(2, Math.ceil(decadeStep / step))
}

function twoPlanetWindowsOf(buys: readonly number[]): number[] {
  return buys.slice(1).map((after, at) => buys[at] + after)
}

function decadeLevelsOf({ numerator, denominator }: RatioFraction): number {
  let power = numerator
  let scale = denominator
  for (let levels = 1; levels <= DECADE_LEVELS_MAX; levels++) {
    if (power >= 10n * scale) return levels
    power *= numerator
    scale *= denominator
  }
  throw new Error(`ratio ${numerator}/${denominator} takes over ${DECADE_LEVELS_MAX} levels`)
}

function ratioFractionOf(ratio: string): RatioFraction {
  const match = DECIMAL_RATIO.exec(ratio)
  if (match === null) throw new Error(`ratio ${ratio} is not a decimal`)
  const decimals = match[2] ?? ''
  const fraction = {
    numerator: BigInt(`${match[1]}${decimals}`),
    denominator: 10n ** BigInt(decimals.length),
  }
  if (fraction.numerator <= fraction.denominator) throw new Error(`ratio ${ratio} is not above 1`)
  return fraction
}
