/**
 * The gems' share of a generated pool's ore value, on paper (ticket 777; Systems' 15% cap of #741,
 * `gemShareCapBp` of the economy rows, which ticket 776 left for the pool to hold). No later system
 * has cells to census yet, so the share is the census's expectation from the laws that would paint
 * them: each band's ore is its ring's area (the band edges as shares of the radius, so any size class
 * reads the same) times the depth curve's ore per tile (`planets.depthDensity.bandMeanBp`, #448),
 * shared out by the mix's patch weights; a cell sells at V of its tier, a gem kind's at V of its
 * sale tier (`t_top + 5/6/8`), and a run's patches split evenly over its kinds. Signature cells
 * count in the whole at their own tier. Integer areas and weights, Money values.
 */
import { ECONOMY } from '../../../systems/economy/economy'
import { oreValue } from '../../../systems/economy/oreEconomy'
import {
  add,
  div,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { BAND_START_DEPTH_PERCENT } from '../../../systems/world/planetTable'
import type { OreMix, OreMixEntry } from '../../planet-mix'

/** A run of the pool as the share reads it: its kinds and the sale tiers of its gem kinds. */
export interface RunSale {
  family: string
  lead: number
  kinds: number
  gemSaleTiers: readonly number[]
}

interface PoolValue {
  whole: Money
  gems: Money
}

const BASIS_POINTS = 10000
const WHOLE_PERCENT = 100
const BAND_EDGES_PERCENT = [0, ...BAND_START_DEPTH_PERCENT, WHOLE_PERCENT]

/** The gems' share of the pool's ore value, in whole basis points rounded down. */
export function gemValueShareBpOf(mix: OreMix, runs: readonly RunSale[]): number {
  const value = poolValueOf(mix, runs)
  return toSafeInteger(floor(mul(div(value.gems, value.whole), fromSafeInteger(BASIS_POINTS))))
}

/**
 * The pool's whole ore value on paper, the gems at their sale tiers (ticket 888, the VS's R3 row):
 * per share of the disc, so a planet's pool is this times its radius squared.
 */
export function poolOreValueOf(mix: OreMix, runs: readonly RunSale[]): Money {
  return poolValueOf(mix, runs).whole
}

function poolValueOf(mix: OreMix, runs: readonly RunSale[]): PoolValue {
  return mix.bands.reduce(
    (sum, entries, at) => addValues(sum, bandValueOf(entries, at + 1, runs)),
    { whole: ZERO_MONEY, gems: ZERO_MONEY },
  )
}

function bandValueOf(
  entries: readonly OreMixEntry[],
  band: number,
  runs: readonly RunSale[],
): PoolValue {
  const oreWeight = ringAreaOf(band) * ECONOMY.planets.depthDensity.bandMeanBp[band - 1]
  return entries.reduce(
    (sum, entry) => addValues(sum, entryValueOf(entry, oreWeight, runOf(runs, entry))),
    { whole: ZERO_MONEY, gems: ZERO_MONEY },
  )
}

/** The entry's cells at V of their tier, its gem kinds' share at V of their sale tier instead. */
function entryValueOf(entry: OreMixEntry, oreWeight: number, run: RunSale | null): PoolValue {
  const cells = mul(fromSafeInteger(oreWeight), fromSafeInteger(entry.weightBp))
  const gems = run === null ? 0 : run.gemSaleTiers.length
  const kinds = run === null ? 1 : run.kinds
  const gemValue = sumOf(run?.gemSaleTiers.map(oreValue) ?? [])
  const plainValue = mul(oreValue(entry.tier), fromSafeInteger(kinds - gems))
  const perKind = div(cells, fromSafeInteger(kinds))
  return { whole: mul(perKind, add(plainValue, gemValue)), gems: mul(perKind, gemValue) }
}

function runOf(runs: readonly RunSale[], entry: OreMixEntry): RunSale | null {
  if (entry.signature) return null
  return runs.find((run) => run.family === entry.family && run.lead === entry.lead) ?? null
}

/** `(100 - top)^2 - (100 - bottom)^2`: the band's share of the disc, up to a constant. */
function ringAreaOf(band: number): number {
  const outer = WHOLE_PERCENT - BAND_EDGES_PERCENT[band - 1]
  const inner = WHOLE_PERCENT - BAND_EDGES_PERCENT[band]
  return outer * outer - inner * inner
}

function addValues(a: PoolValue, b: PoolValue): PoolValue {
  return { whole: add(a.whole, b.whole), gems: add(a.gems, b.gems) }
}

function sumOf(amounts: readonly Money[]): Money {
  return amounts.reduce(add, ZERO_MONEY)
}
