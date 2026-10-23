/**
 * Ticket 449's asserts on a planet reading: every bound Systems set for the materials (#139,
 * 6203159815 as amended by 6203640346, the trip asserts of 6202970624 section 7.5 and the
 * family-first guard of 6226198316), each a named violation with what it read and its limit, so a
 * spec and the status table say the same thing. The kind bounds, the guard and the live commons
 * apply only where the planet has a roster; a planet without one has no kind to bound. A planet on
 * the deep rows (ticket 738) is held to its whole-planet mean, each band's being the named #644
 * re-baseline "deep rares" (Systems' guard on #738).
 */
import { kindBoundBpOf } from './bandShares'
import type { BandReading, PlanetReading } from './planetShares'
import { SHARE_ROWS, type ShareRows } from './shareRows'

/** Systems' bound names, plus the guard, the band mean and the trip ledger's. */
export type ShareBoundId =
  | 'perNonCommonKindMax'
  | 'perNonCommonTierMax'
  | 'epicPlusMythicTripClampBp'
  | 'perCommonKindMaxOfBandTrip'
  | 'perCommonKindMaxOfPlanet'
  | 'liveCommonsPerBandMin'
  | 'kindGuard'
  | 'meanShiftMaxBp'
  | 'planetMeanShiftMaxBp'
  | 'cvMaxBp'
  | 'p999MaxOfNominalBp'
  | 'clampLossMaxBp'

export interface ShareViolation {
  bound: ShareBoundId
  planetIndex: number
  worldSeed: number
  /** null for a whole-planet bound. */
  band: number | null
  /** The kind slot, tier or cell the bound read. */
  subject: string
  value: number
  limit: number
}

type BandCheck = (
  band: BandReading,
  rows: ShareRows,
) => Omit<ShareViolation, 'planetIndex' | 'worldSeed'>[]

type PlanetCheck = (
  reading: PlanetReading,
  rows: ShareRows,
) => Omit<ShareViolation, 'planetIndex' | 'worldSeed'>[]

const ROSTER_BAND_CHECKS: readonly BandCheck[] = [
  kindViolationsOf,
  guardViolationsOf,
  liveCommonViolationsOf,
]
const BAND_CHECKS: readonly BandCheck[] = [tierViolationsOf, tripViolationsOf]

/** Every bound the reading misses; empty when it holds them all. */
export function shareViolationsOf(
  reading: PlanetReading,
  rows: ShareRows = SHARE_ROWS,
): ShareViolation[] {
  const checks = bandChecksOf(reading)
  const inBands = reading.bands.flatMap((band) => checks.flatMap((check) => check(band, rows)))
  const onPlanet = planetChecksOf(reading).flatMap((check) => check(reading, rows))
  const { planetIndex, worldSeed } = reading
  return [...inBands, ...onPlanet].map((violation) => ({ planetIndex, worldSeed, ...violation }))
}

/** Each band's mean, but on the deep rows; the kinds where the planet has a roster. */
function bandChecksOf(reading: PlanetReading): BandCheck[] {
  return [
    ...BAND_CHECKS,
    ...(reading.isDeepRares ? [] : [meanViolationsOf]),
    ...(reading.hasRoster ? ROSTER_BAND_CHECKS : []),
  ]
}

/** The kinds' planet shares where it has a roster; the whole-planet mean on the deep rows. */
function planetChecksOf(reading: PlanetReading): PlanetCheck[] {
  return [
    ...(reading.hasRoster ? [planetKindViolationsOf] : []),
    ...(reading.isDeepRares ? [planetMeanViolationsOf] : []),
  ]
}

/** A violation in one line: what the spec prints when a bound fails. */
export function violationTextOf(violation: ShareViolation): string {
  const where = violation.band === null ? 'planet' : `band ${violation.band}`
  return (
    `P${violation.planetIndex} seed ${violation.worldSeed} ${where} ${violation.subject}: ` +
    `${violation.bound} ${violation.value} over ${violation.limit}`
  )
}

function tierViolationsOf(band: BandReading, rows: ShareRows) {
  const limit = rows.bounds.perNonCommonTierMax
  const tiers = band.shares.tiers.filter((tier) => tier.bandTripBp > limit)
  const overTiers = tiers.map((tier) => ({
    bound: 'perNonCommonTierMax' as const,
    band: band.band,
    subject: tier.tierId,
    value: tier.bandTripBp,
    limit,
  }))
  return [...overTiers, ...epicAndMythicViolationsOf(band, rows)]
}

/** Epic and mythic paid in full in one trip, under the clamp: the ledger's worst trip. */
function epicAndMythicViolationsOf(band: BandReading, rows: ShareRows) {
  const limit = rows.bounds.epicPlusMythicTripClampBp
  const value = band.trip.worstEpicAndMythicBp
  if (value <= limit) return []
  return [
    {
      bound: 'epicPlusMythicTripClampBp' as const,
      band: band.band,
      subject: 'epic+mythic',
      value,
      limit,
    },
  ]
}

function kindViolationsOf(band: BandReading, rows: ShareRows) {
  return band.shares.kinds
    .filter((kind) => kind.bandTripBp > kindLimitOf(kind.isCommon, rows))
    .map((kind) => ({
      bound: kind.isCommon
        ? ('perCommonKindMaxOfBandTrip' as const)
        : ('perNonCommonKindMax' as const),
      band: band.band,
      subject: kind.slotId,
      value: kind.bandTripBp,
      limit: kindLimitOf(kind.isCommon, rows),
    }))
}

function kindLimitOf(isCommon: boolean, rows: ShareRows): number {
  return kindBoundBpOf(isCommon ? 0 : 1, rows.bounds)
}

function guardViolationsOf(band: BandReading) {
  return band.shares.shortCells.map((cell) => ({
    bound: 'kindGuard' as const,
    band: band.band,
    subject: `${cell.family} lead +${cell.lead}`,
    value: cell.liveKinds,
    limit: cell.neededKinds,
  }))
}

function liveCommonViolationsOf(band: BandReading, rows: ShareRows) {
  const limit = rows.liveCommonsPerBandMin
  if (band.shares.liveCommons >= limit) return []
  const value = band.shares.liveCommons
  return [
    { bound: 'liveCommonsPerBandMin' as const, band: band.band, subject: 'commons', value, limit },
  ]
}

function meanViolationsOf(band: BandReading, rows: ShareRows) {
  const limit = rows.trip.meanShiftMaxBp
  if (Math.abs(band.meanShiftBp) < limit) return []
  return [
    {
      bound: 'meanShiftMaxBp' as const,
      band: band.band,
      subject: 'mean',
      value: band.meanShiftBp,
      limit,
    },
  ]
}

/** The deep rows' mean over the whole planet against today's (ticket 738, VS 5% of main). */
function planetMeanViolationsOf(reading: PlanetReading, rows: ShareRows) {
  const limit = rows.deepRares.planetMeanShiftMaxBp
  if (Math.abs(reading.planetMeanShiftBp) <= limit) return []
  return [
    {
      bound: 'planetMeanShiftMaxBp' as const,
      band: null,
      subject: 'mean',
      value: reading.planetMeanShiftBp,
      limit,
    },
  ]
}

function tripViolationsOf(band: BandReading, rows: ShareRows) {
  const { cvBp, p999OfExpectedBp, clampLossBp } = band.trip
  const { cvMaxBp, p999MaxOfNominalBp, clampLossMaxBp } = rows.trip
  return [
    { bound: 'cvMaxBp' as const, band: band.band, subject: 'trip', value: cvBp, limit: cvMaxBp },
    {
      bound: 'p999MaxOfNominalBp' as const,
      band: band.band,
      subject: 'trip',
      value: p999OfExpectedBp,
      limit: p999MaxOfNominalBp,
    },
    {
      bound: 'clampLossMaxBp' as const,
      band: band.band,
      subject: 'trip',
      value: clampLossBp,
      limit: clampLossMaxBp,
    },
  ].filter((violation) => violation.value > violation.limit)
}

function planetKindViolationsOf(reading: PlanetReading, rows: ShareRows) {
  const limitOf = (isCommon: boolean) =>
    isCommon ? rows.bounds.perCommonKindMaxOfPlanet : rows.bounds.perNonCommonKindMax
  return reading.planetKinds
    .filter((kind) => kind.planetBp > limitOf(kind.isCommon))
    .map((kind) => ({
      bound: kind.isCommon
        ? ('perCommonKindMaxOfPlanet' as const)
        : ('perNonCommonKindMax' as const),
      band: null,
      subject: kind.slotId,
      value: kind.planetBp,
      limit: limitOf(kind.isCommon),
    }))
}
