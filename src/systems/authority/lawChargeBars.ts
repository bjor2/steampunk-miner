/**
 * VS's charge bars for the report cut charged on density removed (ticket 535, A6), as ruled on the
 * ticket after the slab replay (VS 6230602042, the GD 6230602177 and 6230606870, the TD
 * 6230608580): the reference is the analytic law value, the drill's quanta a tick for a drill tick
 * of law work read from the ground (density removed times law time), never swept's own charge,
 * which pays 0.62 to 1.74 times the law by its geometry (#540 owns that). On every row of at least
 * `MIN_QUANTA`: energy per unit of law work within 1% of the law, two-sided (at least 0.99, so no
 * free energy; at most 1.25, the tank floor, and at most 1.098, the ratchet, both inside the 1%);
 * heat at least 1.000 of the law less one drill tick of quantization, the carry's own unit. A row
 * under `MIN_QUANTA` is quantized past the bar: carried by the exactness invariant and logged. The
 * ratio to swept is printed beside every row, amber outside 5%, and gates nothing. The margin VS
 * reads is the tank floor over the energy ratio. Only the two lanes use this; it decides no play.
 */
import { LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'

export const LAW_SHARE = 0.01
export const TANK_FLOOR_RATIO = 1.25
export const RATCHET_RATIO = 1.098
/** Under this many quanta one quantum is over the 1% bar: the row is logged, never gated. */
export const MIN_QUANTA = 100
export const SWEPT_AMBER_SHARE = 0.05
/** The analytic law value: the drill's quanta a tick for a drill tick of law work. */
export const QUANTA_PER_LAW_WORK = ENERGY_QUANTA_PER_TICK.drill / LAW_WORK_PER_DRILL_TICK

/** What a run read: law work from the ground, in density sub-steps, and what it was charged. */
export interface ChargeRead {
  lawWork: number
  energy: number
  heatTicks: number
}

export interface LawChargeBars {
  /** The quanta the law prices the run's law work at. */
  expectedQuanta: number
  /** The drill ticks the law heats the run's law work for. */
  expectedHeatTicks: number
  energyRatio: number
  heatRatio: number
  /** One drill tick as a share of the expected heat: the heat bar's quantization slack. */
  oneTickShare: number
  /** VS's tank margin: the floor over the energy ratio; 1.25 at a law-exact charge. */
  margin: number
  isMeasurable: boolean
}

/** A run's ratios to the analytic law value; nothing is measurable where nothing was removed. */
export function lawChargeBarsOf(read: ChargeRead): LawChargeBars {
  const expectedQuanta = read.lawWork * QUANTA_PER_LAW_WORK
  const expectedHeatTicks = read.lawWork / LAW_WORK_PER_DRILL_TICK
  const energyRatio = ratioOf(read.energy, expectedQuanta)
  return {
    expectedQuanta,
    expectedHeatTicks,
    energyRatio,
    heatRatio: ratioOf(read.heatTicks, expectedHeatTicks),
    oneTickShare: expectedHeatTicks === 0 ? 1 : 1 / expectedHeatTicks,
    margin: energyRatio === 0 ? Infinity : TANK_FLOOR_RATIO / energyRatio,
    isMeasurable: expectedQuanta >= MIN_QUANTA,
  }
}

export function isWithinLawShare(ratio: number): boolean {
  return Math.abs(ratio - 1) <= LAW_SHARE
}

export function isUnderTankFloor(ratio: number): boolean {
  return ratio <= TANK_FLOOR_RATIO
}

export function isUnderRatchet(ratio: number): boolean {
  return ratio <= RATCHET_RATIO
}

/** The heat bar: at least the law, less one drill tick of quantization. */
export function isHeatAtLaw(bars: LawChargeBars): boolean {
  return bars.heatRatio >= 1 - bars.oneTickShare
}

/** The verdict of a ratio to swept: printed beside the law bars, amber outside 5%, never gated. */
export function sweptVerdictOf(ratio: number): 'green' | 'amber' {
  return Math.abs(ratio - 1) <= SWEPT_AMBER_SHARE ? 'green' : 'amber'
}

/** One line of the law bars for a row, for the lanes' logs. */
export function lawChargeTextOf(bars: LawChargeBars): string {
  const thousandths = (value: number) => (Math.round(value * 1000) / 1000).toFixed(3)
  const quanta = `${bars.expectedQuanta.toFixed(1)} quanta`
  if (!bars.isMeasurable) return `${quanta}, under ${MIN_QUANTA}: quantized, logged`
  const energy =
    `energy ${thousandths(bars.energyRatio)} of the law` +
    ` (margin ${thousandths(bars.margin)}, floor ${passOf(isUnderTankFloor(bars.energyRatio))},` +
    ` ratchet ${passOf(isUnderRatchet(bars.energyRatio))})`
  const heat = `heat ${thousandths(bars.heatRatio)} of the law (slack ${thousandths(bars.oneTickShare)})`
  return `${quanta}, ${energy}, ${heat}`
}

function passOf(isMet: boolean): string {
  return isMet ? 'pass' : 'fail'
}

function ratioOf(value: number, expected: number): number {
  return expected === 0 ? 0 : value / expected
}
