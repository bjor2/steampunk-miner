/**
 * A planet as the share bounds of ticket 449 read it: per band, the ore cells the planet mix paints
 * (family, rarity lead, what each sells at and its weight) with the roster kinds live on each, and
 * how much of the planet's ore value each band holds. Pure: the planet's params and a mix of it in,
 * no generation.
 *
 * Values are in value units, basis points of the band's own ore `V(t_b)`: `10000 x valueRatio^k` for
 * a cell selling `k` tiers above its band (10000, 15000, 22500, 33750 and 50625 up to mythic), whole
 * numbers, so the trip ledger sums whole units. A signature sells one tier past its own (#232).
 *
 * A band's share of the planet's ore value (Systems' income weighting, comment 6203133480 on #139
 * section 1) is its area times its painted ore fraction, its mean value per ore unit and its ore's
 * price over band 1's. Area is the band's annulus in half-tile distance squared, the core cut out,
 * so it scales with any radius.
 */
import { onCurveSteps, vehicleStatsAt } from '../../../systems/economy/vehicleStats'
import { oreTier, signatureSaleTier } from '../../../systems/economy/oreEconomy'
import { fromSafeInteger, mul, toSafeInteger } from '../../../systems/money'
import type { PlanetParams } from '../../../systems/world/planetParams'
import type { ResourceFamily } from '../../../systems/world/worldCell'
import {
  oreFamilies,
  rarityMultiplierOf,
  rarityRowSetOfPlanet,
  type RarityRowSet,
} from '../../ores'
import type { OreMix, OreMixEntry } from '../../planet-mix'
import { planetRosterOf } from './planetRoster'
import { liveRosterIndicesOf } from './rosterFold'

const BASIS_POINTS = 10000

export interface PaintedCell {
  family: string
  /** Tiers above the band's own: the rarity tier's offset; a signature's is its own tier's. */
  lead: number
  /** Tiers above the band's own the cell sells at. */
  saleLead: number
  isSignature: boolean
  /** Basis points of the band's ore patches (fractional on P1 and P2, split by family). */
  weightBp: number
  /** The slot ids of the roster kinds a patch of this cell draws from. */
  liveKinds: readonly string[]
}

export interface PaintedBand {
  band: number
  cells: readonly PaintedCell[]
}

export interface PaintedPlanet {
  planetIndex: number
  worldSeed: number
  /** Whether the planet draws material kinds at all (ore rules 2 and a kinds table with rows). */
  hasRoster: boolean
  /** The rarity rows the planet draws: legacy, mixed, or deep from ore rules 11 (ticket 738). */
  rowSet: RarityRowSet
  /** Bands 1 to 5. */
  bands: readonly PaintedBand[]
  /** Each band's share of the planet's ore value, relative (bands 1 to 5). */
  bandOreWeights: readonly number[]
}

/** The planet these params make, painted as `mix` paints it. */
export function paintedPlanetOf(params: PlanetParams, mix: OreMix): PaintedPlanet {
  const bands = mix.bands.map((entries, at) => paintedBandOf(params, at + 1, entries))
  return {
    planetIndex: params.planetIndex,
    worldSeed: params.worldSeed,
    hasRoster: planetRosterOf(params).length > 0,
    rowSet: rarityRowSetOfPlanet(params),
    bands,
    bandOreWeights: bandOreWeightsOf(params, bands),
  }
}

/** `10000 x valueRatio^k`: what a cell `k` tiers above its band sells for, in value units. */
export function valueUnitsOf(tiersAboveBand: number): number {
  return toSafeInteger(mul(rarityMultiplierOf(tiersAboveBand), fromSafeInteger(BASIS_POINTS)))
}

/** The band's expected value per ore unit, in value units. */
export function meanValueUnitsOf(band: PaintedBand): number {
  return band.cells.reduce((sum, cell) => sum + cellValueOf(cell), 0) / BASIS_POINTS
}

/** A cell's weight times what it sells at: its part of the band's value, in bp x value units. */
export function cellValueOf(cell: PaintedCell): number {
  return cell.weightBp * valueUnitsOf(cell.saleLead)
}

/** The hold the on-curve vehicle leaves the planet with: the trip the ledger fills. */
export function onCurveHoldOf(planetIndex: number): number {
  return vehicleStatsAt(onCurveSteps(planetIndex)).cargoCapacity
}

function paintedBandOf(
  params: PlanetParams,
  band: number,
  entries: readonly OreMixEntry[],
): PaintedBand {
  const bandTier = oreTier(params.planetIndex, band)
  return {
    band,
    cells: entries.map((entry) => ({
      family: entry.family,
      lead: entry.lead,
      saleLead: saleTierOf(entry) - bandTier,
      isSignature: entry.signature,
      weightBp: entry.weightBp,
      liveKinds: liveKindsOf(params, band, entry),
    })),
  }
}

function saleTierOf(entry: OreMixEntry): number {
  return entry.signature ? signatureSaleTier(entry.tier) : entry.tier
}

function liveKindsOf(params: PlanetParams, band: number, entry: OreMixEntry): string[] {
  const content = { family: cellCodeOf(entry.family), tierOffset: band - 1 + entry.lead }
  const roster = planetRosterOf(params)
  return liveRosterIndicesOf(params, band, content).map((index) => roster[index].slotId)
}

function cellCodeOf(familyId: string): ResourceFamily {
  const family = oreFamilies().find((row) => row.id === familyId)
  if (family === undefined) throw new RangeError(`no ore family "${familyId}"`)
  return family.cellCode as ResourceFamily
}

function bandOreWeightsOf(params: PlanetParams, bands: readonly PaintedBand[]): number[] {
  const areas = bandAreasOf(params)
  return bands.map(
    (band, at) =>
      areas[at] *
      params.oreDensityBp[at] *
      meanValueUnitsOf(band) *
      (valueUnitsOf(at) / BASIS_POINTS),
  )
}

/** Each band's annulus in half-tile distance squared, outer edge first, core cut from band 5. */
function bandAreasOf(params: PlanetParams): number[] {
  const surface = squared(2 * params.radiusTiles)
  const core = squared(2 * params.coreRadiusTiles)
  const edges = [surface, ...params.bandStartsHalfTileSq, core]
  return params.bandStartsHalfTileSq.concat(core).map((inner, at) => edges[at] - inner)
}

function squared(value: number): number {
  return value * value
}
