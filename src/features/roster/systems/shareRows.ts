/**
 * The bounds of ticket 449, read once from `roster.economy.json` and refused whole when broken
 * (Systems' asserts on #139: comment 6203159815 as amended to 650 bp per tier by 6203640346, and
 * the trip asserts of 6202970624 section 7.5). Every bound is integer basis points except the two
 * trip ones Systems wrote in fractions of a basis point (a mean shift under 0.5 bp is "1.0000 to 4
 * decimals"; the clamp may cost at most 1 bp of mean income).
 */
import { createFieldReader, type FieldReader } from '../../../systems/economy/economyFieldReader'
import economyFile from '../roster.economy.json'

/** Systems' `rarityShareBp` block, verbatim. */
export interface RarityShareBounds {
  perNonCommonKindMax: number
  perNonCommonTierMax: number
  epicPlusMythicTripClampBp: number
  perCommonKindMaxOfBandTrip: number
  perCommonKindMaxOfPlanet: number
}

export interface TripBounds {
  /** The band's mean value per ore unit against today's, in basis points either way. */
  meanShiftMaxBp: number
  /** Trip value's standard deviation over its mean. */
  cvMaxBp: number
  /** The 99.9th percentile trip over the band's expected trip. */
  p999MaxOfNominalBp: number
  /** Mean income the epic and mythic clamp takes. */
  clampLossMaxBp: number
}

export interface ShareRows {
  bounds: RarityShareBounds
  /** Distinct common kinds live in every band of a planet with a roster. */
  liveCommonsPerBandMin: number
  trip: TripBounds
  /** The planets the bounds are asserted on and the status page's table prints. */
  judgedPlanets: readonly number[]
  /** Ore units the trip ledger draws per seed, band and planet: the sample, not a bound. */
  tripFindsPerSeed: number
}

export const SHARE_ROWS: ShareRows = loadShareRows(economyFile)

/** Every problem with the file, or the rows when it has none. */
export function readShareRows(raw: unknown): { rows: ShareRows } | { problems: string[] } {
  const reader = createFieldReader()
  const shares = reader.object('shares', reader.object('file', raw).shares)
  const rows: ShareRows = {
    bounds: boundsOf(reader, reader.object('shares.rarityShareBp', shares.rarityShareBp)),
    liveCommonsPerBandMin: reader.safeInteger(
      'liveCommonsPerBandMin',
      shares.liveCommonsPerBandMin,
    ),
    trip: tripBoundsOf(reader, reader.object('shares.trip', shares.trip)),
    judgedPlanets: planetsOf(reader, shares.judgedPlanets),
    tripFindsPerSeed: reader.safeInteger('tripFindsPerSeed', shares.tripFindsPerSeed),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { rows }
}

function loadShareRows(raw: unknown): ShareRows {
  const read = readShareRows(raw)
  if ('problems' in read)
    throw new Error(`roster.economy.json is refused:\n${read.problems.join('\n')}`)
  return read.rows
}

function boundsOf(reader: FieldReader, raw: Record<string, unknown>): RarityShareBounds {
  const read = (key: keyof RarityShareBounds) =>
    reader.safeInteger(`rarityShareBp.${key}`, raw[key])
  return {
    perNonCommonKindMax: read('perNonCommonKindMax'),
    perNonCommonTierMax: read('perNonCommonTierMax'),
    epicPlusMythicTripClampBp: read('epicPlusMythicTripClampBp'),
    perCommonKindMaxOfBandTrip: read('perCommonKindMaxOfBandTrip'),
    perCommonKindMaxOfPlanet: read('perCommonKindMaxOfPlanet'),
  }
}

function tripBoundsOf(reader: FieldReader, raw: Record<string, unknown>): TripBounds {
  return {
    meanShiftMaxBp: reader.boundedNumber('trip.meanShiftMaxBp', raw.meanShiftMaxBp),
    cvMaxBp: reader.safeInteger('trip.cvMaxBp', raw.cvMaxBp),
    p999MaxOfNominalBp: reader.safeInteger('trip.p999MaxOfNominalBp', raw.p999MaxOfNominalBp),
    clampLossMaxBp: reader.boundedNumber('trip.clampLossMaxBp', raw.clampLossMaxBp),
  }
}

function planetsOf(reader: FieldReader, raw: unknown): number[] {
  return reader
    .list('judgedPlanets', raw)
    .map((planet, at) => reader.safeInteger(`judgedPlanets[${at}]`, planet))
}
