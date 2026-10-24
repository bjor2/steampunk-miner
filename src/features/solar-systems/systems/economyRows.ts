/**
 * A solar system's economy rows (ticket 776, spec #774; the Systems rows under the GD lock of
 * 23 Oct 2026 on Campaign Scaling and its VS input): one row per planet of a system past the first,
 * computed from its roster planet and the laws system 1 already runs on, never written per planet.
 * Everything keys on the contiguous campaign index `g = campaignIndex(s, p)` (ticket 781):
 *
 * - **Values** come from V(t) at the ore tier `t = 3(g - 1) + b` of each band, so the jump into a
 *   system is the value step of any p -> p + 1 (VS: no value step at the jump).
 * - **Gems** sell at `t_top(g) + 5, 6, 8` (#741), the kernel planet row's formula at `g`.
 * - **Size** is the #305 ladder's: the radius system 1 gives the planet at `g` (the frozen radius
 *   rows, then #6's ladder), times the roster's size class. Cells and resources grow with R squared.
 * - **Hardness**: system s's ground is `k_jump^(s - 1)` over system 1's at the same g (ticket 759),
 *   times k_s on the system's hard start (`economyRules.ts`). The arrival step is what the planet's
 *   ground adds over the planet before's: k_jump on a system's first planet, k_s on the hard start,
 *   1 elsewhere, and `k_jump / k_s` on the first planet after a hard start.
 * - **Fee**: the fuel to arrive from the planet before, J times the hop's units on the jump between
 *   systems (`economy/jumpFuel.ts`).
 * - **Pool step**: the planet's ore pool value over the planet before's, the value step times
 *   `(R / R_before)^2` (R3; the bands and the ore density are the same shares of either planet).
 *
 * The planet before system s's first is system s - 1's last; before system 2's first it is system
 * 1's planet `planetsPerSystem`, on system 1's own rows. Pure and finite at any `s` the campaign index
 * keeps a safe planet index for; system 1 is refused, as the roster refuses it.
 */
import { compoundRatio } from '../../../systems/economy/curveFamilies'
import { ECONOMY } from '../../../systems/economy/economy'
import { jumpFeeOf, systemJumpFeeOf } from '../../../systems/economy/jumpFuel'
import { oreTier } from '../../../systems/economy/oreEconomy'
import { systemHardnessStepOf, systemJumpHardnessStep } from '../../../systems/economy/systemJump'
import {
  div,
  fromSafeInteger,
  mul,
  toCanonical,
  type BigStat,
  type Money,
} from '../../../systems/money'
import { gemSaleTiersOfPlanet } from '../../../systems/registries/planetRow'
import { campaignIndex, planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import { FIRST_SYSTEM, readIndexText, toIndexText } from '../../../systems/starMap/planetAddress'
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { freshRadiusTilesOf } from '../../../systems/world/planetParams'
import { ECONOMY_ROW_RULES } from './economyRules'
import { planetsPerSystem } from './newContentSlots'
import { ARCHETYPE_PALETTE } from './paletteRows'
import { systemRosterOf, type PlanetId, type RosterPlanet, type SurfaceStart } from './systemRoster'

export interface PlanetEconomyRow {
  id: PlanetId
  /** `g`, as canonical text. */
  campaignIndex: string
  /** The roster's size class id. */
  sizeClass: string
  surface: SurfaceStart
  /** System 1's radius at `g` times the size class, in whole tiles. */
  radiusTiles: number
  /** The ore tier of bands 1 to 5; each sells at V(t). */
  bandTiers: readonly number[]
  /** The tiers the planet's gems sell at, cheapest first. */
  gemSaleTiers: readonly number[]
  /** Its ground over system 1's at the same `g`. */
  hardnessStep: BigStat
  /** Its ground over the planet before's, beside the tiers' own step: what arrival feels. */
  arrivalStep: BigStat
  /** The fuel fee to arrive from the planet before. */
  arrivalFee: Money
  /** V(t) over the planet before's at every band. */
  valueStep: BigStat
  /** Its ore pool value over the planet before's. */
  poolStep: BigStat
}

/** The row with its amounts as canonical text: what the debug surface prints and goldens pin. */
export type EconomyRowText = Omit<PlanetEconomyRow, AmountField> & Record<AmountField, string>

type AmountField = 'hardnessStep' | 'arrivalStep' | 'arrivalFee' | 'valueStep' | 'poolStep'

/** Where a planet stands before it is set against the planet before it. */
interface PlanetBasis {
  system: bigint
  planetIndex: number
  radiusTiles: number
  /** k_s on the hard start, 1 on a standard one. */
  surfaceStep: BigStat
}

const BASIS_POINTS = 10000
const ONE = fromSafeInteger(1)
const BANDS = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)
const FIRST_BAND = 1

/** The economy rows of system `system` (from 2), in place order. */
export function systemEconomyRowsOf(worldSeed: number, system: bigint): PlanetEconomyRow[] {
  const roster = systemRosterOf(worldSeed, system)
  const bases = roster.map((planet) => basisOfRosterPlanet(system, planet))
  const before = [lastBasisBefore(worldSeed, system), ...bases.slice(0, -1)]
  return roster.map((planet, at) => economyRowOf(planet, bases[at], before[at]))
}

/** One planet's economy row; throws for system 1 or a place the system lacks. */
export function planetEconomyRowOf(
  worldSeed: number,
  system: bigint,
  planet: bigint,
): PlanetEconomyRow {
  const rows = systemEconomyRowsOf(worldSeed, system)
  const found = rows.find((row) => row.id.planet === toIndexText(planet))
  if (found === undefined) throw new RangeError(`system ${system} holds no planet ${planet}`)
  return found
}

export function economyRowTextOf(row: PlanetEconomyRow): EconomyRowText {
  return {
    ...row,
    hardnessStep: toCanonical(row.hardnessStep),
    arrivalStep: toCanonical(row.arrivalStep),
    arrivalFee: toCanonical(row.arrivalFee),
    valueStep: toCanonical(row.valueStep),
    poolStep: toCanonical(row.poolStep),
  }
}

function economyRowOf(
  planet: RosterPlanet,
  basis: PlanetBasis,
  before: PlanetBasis,
): PlanetEconomyRow {
  return {
    id: planet.id,
    campaignIndex: planet.campaignIndex,
    sizeClass: planet.sizeClass,
    surface: planet.surface,
    radiusTiles: basis.radiusTiles,
    bandTiers: BANDS.map((band) => oreTier(basis.planetIndex, band)),
    gemSaleTiers: gemSaleTiersOfPlanet(basis.planetIndex),
    hardnessStep: mul(systemHardnessStepOf(basis.system), basis.surfaceStep),
    arrivalStep: arrivalStepOf(basis, before),
    arrivalFee: arrivalFeeOf(basis, before),
    valueStep: valueStepOf(basis, before),
    poolStep: poolStepOf(basis, before),
  }
}

function basisOfRosterPlanet(system: bigint, planet: RosterPlanet): PlanetBasis {
  const planetIndex = planetIndexOfCampaign(readIndexText(planet.campaignIndex) ?? 0n)
  return {
    system,
    planetIndex,
    radiusTiles: scaledRadiusOf(freshRadiusTilesOf(planetIndex), radiusBpOf(planet.sizeClass)),
    surfaceStep: planet.surface === 'hard' ? ECONOMY_ROW_RULES.hardStartStep : ONE,
  }
}

/** The last planet of the system before: system 1's on its own rows, a drawn system's from its roster. */
function lastBasisBefore(worldSeed: number, system: bigint): PlanetBasis {
  const previous = system - 1n
  if (previous === FIRST_SYSTEM) return firstSystemBasisAt(planetsPerSystem())
  const last = systemRosterOf(worldSeed, previous).at(-1)
  if (last === undefined) throw new RangeError(`system ${previous} holds no planet`)
  return basisOfRosterPlanet(previous, last)
}

function firstSystemBasisAt(place: number): PlanetBasis {
  const planetIndex = planetIndexOfCampaign(campaignIndex(FIRST_SYSTEM, BigInt(place)))
  return {
    system: FIRST_SYSTEM,
    planetIndex,
    radiusTiles: freshRadiusTilesOf(planetIndex),
    surfaceStep: ONE,
  }
}

/** k_jump into a new system, times this planet's surface step over the one before's. */
function arrivalStepOf(basis: PlanetBasis, before: PlanetBasis): BigStat {
  const systemStep = basis.system === before.system ? ONE : systemJumpHardnessStep()
  return div(mul(systemStep, basis.surfaceStep), before.surfaceStep)
}

function arrivalFeeOf(basis: PlanetBasis, before: PlanetBasis): Money {
  return basis.system === before.system
    ? jumpFeeOf(before.planetIndex, basis.planetIndex)
    : systemJumpFeeOf(before.planetIndex, basis.planetIndex)
}

/** V(t) over V(t_before): the value ratio to the tiers between, the same at every band. */
function valueStepOf(basis: PlanetBasis, before: PlanetBasis): BigStat {
  const tiers = oreTier(basis.planetIndex, FIRST_BAND) - oreTier(before.planetIndex, FIRST_BAND)
  return compoundRatio(ECONOMY.ore.valueRatio, tiers)
}

/** The value step times `(R / R_before)^2`: cells grow with the radius squared. */
function poolStepOf(basis: PlanetBasis, before: PlanetBasis): BigStat {
  return mul(valueStepOf(basis, before), areaStepOf(basis, before))
}

function areaStepOf(basis: PlanetBasis, before: PlanetBasis): BigStat {
  return div(
    fromSafeInteger(basis.radiusTiles * basis.radiusTiles),
    fromSafeInteger(before.radiusTiles * before.radiusTiles),
  )
}

/** System 1's radius at `g` times the class, rounded half up to whole tiles. */
function scaledRadiusOf(radiusTiles: number, radiusBp: number): number {
  return Math.floor((radiusTiles * radiusBp + BASIS_POINTS / 2) / BASIS_POINTS)
}

function radiusBpOf(sizeClassId: string): number {
  const sizeClass = ARCHETYPE_PALETTE.sizeClasses.classes.find((row) => row.id === sizeClassId)
  if (sizeClass === undefined)
    throw new RangeError(`the palette has no size class "${sizeClassId}"`)
  return sizeClass.radiusBp
}
