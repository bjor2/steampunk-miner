/**
 * One judged planet of ticket 449, read: per band its nominal shares, its mean against today's and
 * its trip ledger, and each roster kind's share of the whole planet. The planet is the one a new
 * game, travel or a new save enters (stamped with the build's ore rules) on one world seed.
 *
 * Three paintings of it are read (Systems on #139, comment 6202970624 sections 2 and 10):
 * - **real**, the planet mix play draws: kinds, trips and the clamp are judged on it;
 * - **base**, the same with every signature at its base share, the mix Systems' rarity model is
 *   solved on: the tier shares and the band mean are judged on it, the story and lava boosts being
 *   outside mean preservation by Systems' own scope (only story planets differ);
 * - **today**, the planet as a save holding it without the ore rules draws it (legacy rows, base
 *   share): the mean the rarity rows preserve.
 */
import { freshPlanetParamsFor, planetParamsFor } from '../../../systems/world/planetParams'
import { oreMixAtBaseSignatureOf, oreMixOf } from '../../planet-mix'
import { bandSharesOf, wholeBasisPointsUp, type BandShares } from './bandShares'
import {
  meanValueUnitsOf,
  onCurveHoldOf,
  paintedPlanetOf,
  type PaintedPlanet,
} from './paintedPlanet'
import { SHARE_ROWS, type ShareRows } from './shareRows'
import { tripLedgerOf, type TripLedger } from './tripLedger'

const BASIS_POINTS = 10000

export interface BandReading {
  band: number
  /** Kinds, the guard and live commons on the real mix; tiers on the base mix. */
  shares: BandShares
  /** The real mix's tier shares, apart from `shares.tiers` only where a signature is boosted. */
  realTiers: BandShares['tiers']
  /** The base mix's mean value per ore unit against today's, in basis points either way. */
  meanShiftBp: number
  /** The same for the real mix: apart from it only where a signature is boosted. */
  realMeanShiftBp: number
  trip: TripLedger
}

export interface PlanetKindShare {
  slotId: string
  isCommon: boolean
  /** The kind's share of the planet's ore value, whole basis points rounded up. */
  planetBp: number
}

export interface PlanetReading {
  planetIndex: number
  worldSeed: number
  hold: number
  hasRoster: boolean
  /** Whether a story planet's boost moves a signature off its base share. */
  isSignatureBoosted: boolean
  bands: readonly BandReading[]
  planetKinds: readonly PlanetKindShare[]
}

/** The three paintings of one planet: what play draws, Systems' model of it, and today's. */
export interface PlanetPaintings {
  real: PaintedPlanet
  base: PaintedPlanet
  today: PaintedPlanet
}

/** The planet a fresh game enters on `worldSeed`, read. */
export function planetReadingOf(
  worldSeed: number,
  planetIndex: number,
  rows: ShareRows = SHARE_ROWS,
): PlanetReading {
  return readingOf(paintingsOf(worldSeed, planetIndex), onCurveHoldOf(planetIndex), rows)
}

export function paintingsOf(worldSeed: number, planetIndex: number): PlanetPaintings {
  const fresh = freshPlanetParamsFor(worldSeed, planetIndex)
  const saved = planetParamsFor(worldSeed, planetIndex)
  return {
    real: paintedPlanetOf(fresh, oreMixOf(fresh)),
    base: paintedPlanetOf(fresh, oreMixAtBaseSignatureOf(fresh)),
    today: paintedPlanetOf(saved, oreMixAtBaseSignatureOf(saved)),
  }
}

/** The paintings read with this hold: what the bounds judge and the status table prints. */
export function readingOf(
  paintings: PlanetPaintings,
  hold: number,
  rows: ShareRows = SHARE_ROWS,
): PlanetReading {
  const { real } = paintings
  const bands = real.bands.map((_, at) => bandReadingOf(paintings, at, hold, rows))
  return {
    planetIndex: real.planetIndex,
    worldSeed: real.worldSeed,
    hold,
    hasRoster: real.hasRoster,
    isSignatureBoosted: bands.some((band) => band.meanShiftBp !== band.realMeanShiftBp),
    bands,
    planetKinds: planetKindSharesOf(real, bands),
  }
}

function bandReadingOf(
  { real, base, today }: PlanetPaintings,
  at: number,
  hold: number,
  rows: ShareRows,
): BandReading {
  const realShares = bandSharesOf(real.bands[at], rows.bounds)
  const patch = { planetIndex: real.planetIndex, band: at + 1, hold }
  return {
    band: at + 1,
    shares: { ...realShares, tiers: bandSharesOf(base.bands[at], rows.bounds).tiers },
    realTiers: realShares.tiers,
    meanShiftBp: meanShiftBpOf(base, today, at),
    realMeanShiftBp: meanShiftBpOf(real, today, at),
    trip: tripLedgerOf(real.bands[at], patch, [real.worldSeed], rows.tripFindsPerSeed),
  }
}

function meanShiftBpOf(planet: PaintedPlanet, today: PaintedPlanet, at: number): number {
  const before = meanValueUnitsOf(today.bands[at])
  return ((meanValueUnitsOf(planet.bands[at]) - before) / before) * BASIS_POINTS
}

/** Each kind's band-trip shares weighed by the bands' parts of the planet's ore value. */
function planetKindSharesOf(
  planet: PaintedPlanet,
  bands: readonly BandReading[],
): PlanetKindShare[] {
  const totalWeight = planet.bandOreWeights.reduce((sum, weight) => sum + weight, 0)
  const shares = new Map<string, { isCommon: boolean; share: number }>()
  bands.forEach((band, at) => {
    for (const kind of band.shares.kinds) {
      const share = (kind.tripShare * planet.bandOreWeights[at]) / totalWeight
      const kept = shares.get(kind.slotId)?.share ?? 0
      shares.set(kind.slotId, { isCommon: kind.isCommon, share: kept + share })
    }
  })
  return [...shares].map(([slotId, { isCommon, share }]) => ({
    slotId,
    isCommon,
    planetBp: wholeBasisPointsUp(share),
  }))
}
