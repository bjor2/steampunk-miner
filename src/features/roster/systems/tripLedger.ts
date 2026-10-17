/**
 * The trip ledger of ticket 449 (Systems' variance model, comment 6202970624 on #139 section 4):
 * a trip fills a hold in one band, every ore unit an independent draw at the band's painted
 * weights, priced by the real epic and mythic trip clamp (`paidRarityFind`, #509) and summed in
 * whole value units (basis points of the band's own ore). Like Systems' model it reads one ore cell
 * as one hold unit.
 *
 * The clamp's state within a trip is how many finds of each clamped tier it has paid in full, so
 * each of its answers is asked once per state and kept (`ClampBook`); the ledger reads the trip two
 * ways with the same answers:
 * - **exactly**, walking the clamp's states unit by unit: the trip's mean, its spread (CV) and the
 *   mean income the clamp takes, with no sampling noise (Systems' P3 band 5 clamp cost of about
 *   0.9 bp sits near its 1 bp bound, where a sample flips either way);
 * - **by seeded trips** on each seed (a stream from the seed, the planet and the band, pooled): the
 *   99.9th percentile trip over the expected one and the largest share of one trip epic and mythic
 *   were paid in full.
 */
import { hashCell } from '../../../systems/cellRandom'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { createSeededRandom, type SeededRandom } from '../../../systems/seededRandom'
import {
  isTripClamped,
  NEW_RARITY_TRIP,
  ORE_ROWS,
  paidRarityFind,
  type RarityTrip,
} from '../../ores'
import { wholeBasisPointsUp } from './bandShares'
import { valueUnitsOf, type PaintedBand } from './paintedPlanet'

/** The ores rows the clamp reads; a spec may hand in a looser clamp to prove the bound fails. */
type OreRows = typeof ORE_ROWS

const BASIS_POINTS = 10000
const P999 = 0.999
/** A clamp state's key counts each clamped tier's full payments in its own base-1024 digit. */
const KEY_BASE = 1024
const NEW_TRIP_KEY = 0
/** An answer's key: the state's times this plus the draw's lead (at most mythic's 4). */
const LEADS_PER_KEY = 8
/** States the walk can no longer reach in a way any basis point would show. */
const NEGLIGIBLE_CHANCE = 1e-18

/** Where the trips are filled: the band of the planet, and the hold they fill. */
export interface TripPatch {
  planetIndex: number
  band: number
  hold: number
}

export interface TripLedger {
  /** Seeded trips drawn, over every seed. */
  trips: number
  /** The expected trip before the clamp, in value units: the hold at the band's mean per unit. */
  expectedTripUnits: number
  /** The expected trip after the clamp over the one before it, exactly. */
  meanPaidOfExpected: number
  cvBp: number
  /** Expected value the clamp holds back over the value found, in basis points (fractional). */
  clampLossBp: number
  /** From the seeded trips. */
  p999OfExpectedBp: number
  worstEpicAndMythicBp: number
}

/** One kind of draw: its weight, the tiers above the band it is found and sold at, its value. */
interface Draw {
  weightBp: number
  lead: number
  saleLead: number
  units: number
  isClamped: boolean
}

/** What a unit paid and the clamp state it leaves. */
interface PaidUnit {
  units: number
  isPaidInFull: boolean
  nextKey: number
}

/** The clamp's answers, asked of the real `paidRarityFind` once per state and draw. */
interface ClampBook {
  pay(key: number, draw: Draw): PaidUnit
}

/** One clamp state's part of the exact walk: its chance and the trip's moments within it. */
interface StateMoments {
  chance: number
  /** E[trip x 1{state}] and E[trip^2 x 1{state}], in value units. */
  first: number
  second: number
}

interface SampledTrip {
  paid: number
  epicAndMythic: number
}

/** The band's trips: the exact walk, then `findsPerSeed` ore units of seeded trips per seed. */
export function tripLedgerOf(
  band: PaintedBand,
  at: TripPatch,
  seeds: readonly number[],
  findsPerSeed: number,
  rows: OreRows = ORE_ROWS,
): TripLedger {
  const draws = drawsOf(band, rows)
  const book = clampBookOf(at, draws, rows)
  const expectedTripUnits = at.hold * expectedUnitOf(draws)
  return {
    expectedTripUnits,
    ...exactTripOf(draws, at, book, expectedTripUnits),
    ...sampledTripsOf(draws, at, book, { seeds, findsPerSeed, expectedTripUnits }),
  }
}

/** The draws of a band: its cells merged by what they are found and sold at, whole weights. */
function drawsOf(band: PaintedBand, rows: OreRows): Draw[] {
  const merged = new Map<string, Draw>()
  for (const cell of band.cells) {
    const key = `${cell.lead}:${cell.saleLead}`
    const weightBp = (merged.get(key)?.weightBp ?? 0) + cell.weightBp
    const isClamped = !cell.isSignature && isTripClamped(cell.lead, rows)
    const units = valueUnitsOf(cell.saleLead)
    merged.set(key, { weightBp, lead: cell.lead, saleLead: cell.saleLead, units, isClamped })
  }
  return [...merged.values()].map(wholeWeightOf)
}

/** P1 and P2 split each lead by family weight; the split sums back to the lead's whole bp. */
function wholeWeightOf(draw: Draw): Draw {
  const weightBp = Math.round(draw.weightBp)
  if (Math.abs(weightBp - draw.weightBp) > 1e-6) {
    throw new RangeError(`a draw weighs ${draw.weightBp} bp, not a whole number`)
  }
  return { ...draw, weightBp }
}

function expectedUnitOf(draws: readonly Draw[]): number {
  return sumOf(draws.map((draw) => draw.weightBp * draw.units)) / BASIS_POINTS
}

function clampBookOf(at: TripPatch, draws: readonly Draw[], rows: OreRows): ClampBook {
  const bandTier = oreTier(at.planetIndex, at.band)
  const firstClampedLead = Math.min(...draws.filter((draw) => draw.isClamped).map((d) => d.lead))
  const trips = new Map<number, RarityTrip>([[NEW_TRIP_KEY, NEW_RARITY_TRIP]])
  const answers = new Map<number, PaidUnit>()
  const ask = (key: number, draw: Draw): PaidUnit => {
    const saleTier = bandTier + draw.saleLead
    const find = { ...at, tierAboveBand: draw.lead, saleTier, cargoCapacity: at.hold }
    const paid = paidRarityFind(trips.get(key) as RarityTrip, find, rows)
    const isPaidInFull = paid.saleTier === saleTier
    const nextKey = isPaidInFull ? key + keyDigitOf(draw.lead - firstClampedLead) : key
    trips.set(nextKey, paid.trip)
    return { units: valueUnitsOf(paid.saleTier - bandTier), isPaidInFull, nextKey }
  }
  return {
    pay(key, draw) {
      if (!draw.isClamped) return { units: draw.units, isPaidInFull: true, nextKey: key }
      const answerKey = key * LEADS_PER_KEY + draw.lead
      const known = answers.get(answerKey)
      if (known !== undefined) return known
      const answer = ask(key, draw)
      answers.set(answerKey, answer)
      return answer
    },
  }
}

/** `KEY_BASE^digit`: one more full payment of the clamped tier counted in that digit. */
function keyDigitOf(digit: number): number {
  let step = 1
  for (let at = 0; at < digit; at++) step *= KEY_BASE
  return step
}

/** The trip's mean, spread and clamp cost, walking every clamp state unit by unit. */
function exactTripOf(
  draws: readonly Draw[],
  at: TripPatch,
  book: ClampBook,
  expectedTripUnits: number,
): Pick<TripLedger, 'meanPaidOfExpected' | 'cvBp' | 'clampLossBp'> {
  let states = new Map<number, StateMoments>([[NEW_TRIP_KEY, { chance: 1, first: 0, second: 0 }]])
  let heldBack = 0
  for (let unit = 0; unit < at.hold; unit++) {
    const next = new Map<number, StateMoments>()
    for (const [key, moments] of states) heldBack += stepState(draws, book, key, moments, next)
    states = withoutNegligibleStates(next)
  }
  const first = sumOf([...states.values()].map((moments) => moments.first))
  const second = sumOf([...states.values()].map((moments) => moments.second))
  return {
    meanPaidOfExpected: first / expectedTripUnits,
    cvBp: wholeBasisPointsUp(Math.sqrt(Math.max(0, second - first * first)) / first),
    clampLossBp: (heldBack / expectedTripUnits) * BASIS_POINTS,
  }
}

/** One unit drawn in one state: its moments carried into `next`; returns the value held back. */
function stepState(
  draws: readonly Draw[],
  book: ClampBook,
  key: number,
  moments: StateMoments,
  next: Map<number, StateMoments>,
): number {
  let heldBack = 0
  for (const draw of draws) {
    const share = draw.weightBp / BASIS_POINTS
    const paid = book.pay(key, draw)
    addMoments(next, paid.nextKey, movedMoments(moments, share, paid.units))
    heldBack += moments.chance * share * (draw.units - paid.units)
  }
  return heldBack
}

/** E[(S + v) x 1] and E[(S + v)^2 x 1] for the `share` of the state that drew `v`. */
function movedMoments(
  { chance, first, second }: StateMoments,
  share: number,
  v: number,
): StateMoments {
  return {
    chance: chance * share,
    first: share * (first + v * chance),
    second: share * (second + 2 * v * first + v * v * chance),
  }
}

function addMoments(states: Map<number, StateMoments>, key: number, moments: StateMoments): void {
  const kept = states.get(key) ?? { chance: 0, first: 0, second: 0 }
  states.set(key, {
    chance: kept.chance + moments.chance,
    first: kept.first + moments.first,
    second: kept.second + moments.second,
  })
}

function withoutNegligibleStates(states: Map<number, StateMoments>): Map<number, StateMoments> {
  return new Map([...states].filter(([, moments]) => moments.chance >= NEGLIGIBLE_CHANCE))
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

/** Seeded trips: the 99.9th percentile and the worst epic and mythic share of one trip. */
function sampledTripsOf(
  draws: readonly Draw[],
  at: TripPatch,
  book: ClampBook,
  sample: { seeds: readonly number[]; findsPerSeed: number; expectedTripUnits: number },
): Pick<TripLedger, 'trips' | 'p999OfExpectedBp' | 'worstEpicAndMythicBp'> {
  const tripsPerSeed = Math.max(1, Math.ceil(sample.findsPerSeed / at.hold))
  const trips = sample.seeds.flatMap((seed) => {
    const random = createSeededRandom(hashCell(seed, at.planetIndex, at.band))
    return Array.from({ length: tripsPerSeed }, () => sampledTripOf(draws, at, book, random))
  })
  const p999 = quantileOf(
    trips.map((trip) => trip.paid),
    P999,
  )
  return {
    trips: trips.length,
    p999OfExpectedBp: wholeBasisPointsUp(p999 / sample.expectedTripUnits),
    worstEpicAndMythicBp: trips.reduce(
      (worst, trip) => Math.max(worst, wholeBasisPointsUp(trip.epicAndMythic / trip.paid)),
      0,
    ),
  }
}

function sampledTripOf(
  draws: readonly Draw[],
  at: TripPatch,
  book: ClampBook,
  random: SeededRandom,
): SampledTrip {
  const trip: SampledTrip = { paid: 0, epicAndMythic: 0 }
  let key = NEW_TRIP_KEY
  for (let unit = 0; unit < at.hold; unit++) {
    const draw = drawOf(draws, random.nextInt(BASIS_POINTS))
    const paid = book.pay(key, draw)
    key = paid.nextKey
    trip.paid += paid.units
    if (draw.isClamped && paid.isPaidInFull) trip.epicAndMythic += paid.units
  }
  return trip
}

function drawOf(draws: readonly Draw[], roll: number): Draw {
  let left = roll
  for (const draw of draws) {
    if (left < draw.weightBp) return draw
    left -= draw.weightBp
  }
  return draws[draws.length - 1]
}

/** The sample's `share` quantile, the nearest rank at or above it. */
function quantileOf(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)]
}
