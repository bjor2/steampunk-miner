/**
 * The dynamite size ladder (#143 numbers with amendments 2 and 3, #153 design and amendments, the
 * Game Director, Technical Director and Systems locks on #149, K8 #218; 12 rows of 3 types, D1
 * #860 with the D6 radii of #865; money only from D4 #863). Sizes run from 1 to `chargeSizeCount()`;
 * size 1 is the shipped `blasting_charges` charge (#109) with all its numbers.
 *
 *   radius        `sizes.radius[n - 1]` tiles: 2.5 3.5 4.5 6 | 8 10 13 16 | 20 24 30 37, the
 *                 only ladder, in whole half-tiles so the disc's r² is an integer (`blastDisc.ts`)
 *   type          1 (breaking) sizes 1-4, 2 (deep) 5-8, 3 (biggest) 9-12: types are verbs, sizes
 *                 scale; each type's `breaksGate[]` names the gate tiers its blast breaks
 *   sold          every size on every planet, its price the only gate (D4 #863)
 *   price         ceilMilli(count * 2 * 1.8^(n - 1) * V(t(p, 5)) * paceScale(p)), through
 *                 `bandOrePriceAt`, never its raw worth (Systems on #218)
 *   kept          0.4 * 0.8^(n - 1) of the ordinary ore the blast breaks
 *   rack slots    1 1 1 2 2 3 4 5 6 8 8 8 (a full rack holds 8)
 *   fuse          120 120 120 150 180 210 ticks; sizes 7-12 are remote, fired by the plunger
 *                 (#149) and disarmed 3600 ticks after planting (#153)
 *   self hit      selfHit(p) * r(n) / r(1); from size 4 the inner half of the radius wrecks
 *   gate tier     a dynamite-gated cell's tier: clamp(T(p) - 2 + lead, 1, band), T(p) the newest
 *                 tier laid on the planet (1 and 2 from P7, 3 from P9); a blast opens it only when
 *                 the tier is in its type's `breaksGate[]` (D4 #863)
 *   collapse      a bare rim block collapses when its roll is under collapseBp: 0 for sizes 1-4,
 *                 1250 2500 3750 5000 for 5-8 and 5000 for 9-12 (D6 #865, rolled by D2 #861)
 */
import { MM_PER_METRE } from '../../constants/physics'
import {
  ceil,
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  type BigStat,
  type Money,
} from '../money'
import { bandOrePriceAt } from './bandOreCost'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'
import type { BandOreCost } from './economyDefinition'

const { sizes, gateTiers } = ECONOMY.blastingCharges
const MM_PER_TILE = fromSafeInteger(MM_PER_METRE)

/** One size of the ladder as #143 reads it (`chargeSpec(n, p)`), priced for one charge on `p`. */
export interface ChargeSpec {
  size: number
  /** The charge type, a verb (D1 #860): 1 breaking, 2 deep, 3 biggest. */
  type: number
  /** The gate tiers its blast breaks (`breaksGate[]`). */
  breaksGate: readonly number[]
  radiusMm: number
  price: Money
  keptFraction: BigStat
  rackSlots: number
  /** Ticks from plant to blast, or null for a remote charge only the plunger fires. */
  fuseTicks: number | null
}

/** A dynamite-gated ore cell as `gateTierFor` reads it: its rarity lead and its band. */
export interface DynamiteGatedCell {
  lead: number
  band: number
}

export function chargeSpec(size: number, planetIndex: number): ChargeSpec {
  return {
    size,
    type: chargeTypeOf(size),
    breaksGate: breaksGateOf(size),
    radiusMm: chargeRadiusMm(size),
    price: chargePrice(size, 1, planetIndex),
    keptFraction: keptFractionOf(size),
    rackSlots: rackSlotsOf(size),
    fuseTicks: fuseTicksOf(size),
  }
}

/**
 * The gate tier of a dynamite-gated cell on planet `planetIndex`: the newest tier laid there less
 * `newestTierLead` plus the cell's lead, at least 1 and at most its band; 0 before any is laid.
 */
export function gateTierFor(cell: DynamiteGatedCell, planetIndex: number): number {
  const newest = newestGateTierOn(planetIndex)
  if (newest === 0) return 0
  const wanted = newest - gateTiers.newestTierLead + cell.lead
  return Math.min(Math.max(wanted, 1), newest, cell.band)
}

/** T(p): the newest gate tier laid on planet `planetIndex`, 0 before the first. */
export function newestGateTierOn(planetIndex: number): number {
  return gateTiers.fromPlanet.filter((fromPlanet) => fromPlanet <= planetIndex).length
}

/** Whether a blast of `size` opens rock of gate tier `tier`: its type's `breaksGate[]` holds it. */
export function doesSizeBreakGate(size: number, tier: number): boolean {
  return breaksGateOf(size).includes(tier)
}

/** Whether a charge of type `type` opens rock of gate tier `tier`. */
export function doesTypeBreakGate(type: number, tier: number): boolean {
  return (sizes.breaksGateByType[type - 1] ?? []).includes(tier)
}

/** The first charge type whose blast opens gate tier `tier`; the reader has every laid tier named. */
export function chargeTypeBreaking(tier: number): number {
  const at = sizes.breaksGateByType.findIndex((tiers) => tiers.includes(tier))
  if (at === -1) throw new RangeError(`no charge type breaks gate tier ${tier}`)
  return at + 1
}

/** The smallest charge that opens rock of gate tier `tier`: the first size of the first type. */
export function smallestSizeBreaking(tier: number): number {
  return firstSizeOfType(chargeTypeBreaking(tier))
}

/** The smallest size of charge type `type`. */
export function firstSizeOfType(type: number): number {
  const at = sizes.type.indexOf(type)
  if (at === -1) throw new RangeError(`no charge size is of type ${type}`)
  return at + 1
}

export function chargeSizeCount(): number {
  return sizes.radius.length
}

/** Sizes 1 to `top`, smallest first. */
export function chargeSizesUpTo(top: number): number[] {
  return Array.from({ length: Math.min(top, chargeSizeCount()) }, (_, at) => at + 1)
}

export function isChargeSize(size: number): boolean {
  return Number.isSafeInteger(size) && size >= 1 && size <= chargeSizeCount()
}

/** The size's charge type, 1 to the last type listed. */
export function chargeTypeOf(size: number): number {
  return sizes.type[indexOfSize(size)]
}

/** The gate tiers a blast of this size breaks: its type's `breaksGate[]`. */
export function breaksGateOf(size: number): readonly number[] {
  return sizes.breaksGateByType[chargeTypeOf(size) - 1]
}

/** The blast's radius in whole millimetres, rounded out. */
export function chargeRadiusMm(size: number): number {
  return toSafeInteger(ceil(mul(radiusTilesOf(size), MM_PER_TILE)))
}

/** The blast's reach in whole tiles round the charge tile, for the tiles worth testing. */
export function chargeReachTiles(size: number): number {
  return toSafeInteger(floor(radiusTilesOf(size)))
}

/** Whether a point `dxMm, dyMm` from the charge tile's centre is inside the blast. */
export function isInChargeRadius(size: number, dxMm: number, dyMm: number): boolean {
  const radiusMm = chargeRadiusMm(size)
  return dxMm * dxMm + dyMm * dyMm <= radiusMm * radiusMm
}

/** Whether a point is inside the radius's lethal core, its inner half (#153). */
export function isInLethalCore(size: number, dxMm: number, dyMm: number): boolean {
  const coreMm = mul(fromSafeInteger(chargeRadiusMm(size)), sizes.lethalCoreFraction)
  return cmp(fromSafeInteger(dxMm * dxMm + dyMm * dyMm), mul(coreMm, coreMm)) <= 0
}

/** Whether the lethal core of this size wrecks its planter (#153: sizes 4 and up). */
export function hasLethalCore(size: number): boolean {
  return sizeOf(size) >= sizes.lethalCoreFrom
}

/** Ticks from plant to blast, or null for a remote size. */
export function fuseTicksOf(size: number): number | null {
  return sizes.fuseTicks[indexOfSize(size)] ?? null
}

export function isRemoteSize(size: number): boolean {
  return fuseTicksOf(size) === null
}

/** A live remote charge nobody fired is disarmed and lost this long after planting (#153). */
export function remoteDisarmTicks(): number {
  return sizes.remoteDisarmTicks
}

export function keptFractionOf(size: number): BigStat {
  return growGeometric(sizes.keptBase, sizes.keptRatio, indexOfSize(size))
}

/** The basis points out of 10000 under which a bare rim block's roll collapses it (D2 #861). */
export function collapseBpOf(size: number): number {
  return sizes.collapseBp[indexOfSize(size)]
}

export function rackSlotsOf(size: number): number {
  return sizes.rackSlots[indexOfSize(size)]
}

/** One charge of this size as a `bandOre` cost: its ore units of band `oreUnitsBand`. */
export function chargeCostOf(size: number): BandOreCost {
  const oreUnits = growGeometric(sizes.oreUnitsBase, sizes.oreUnitsRatio, indexOfSize(size))
  return { band: sizes.oreUnitsBand, oreUnits }
}

/**
 * `count` charges of `size` bought on planet `planetIndex`: the ceiled `bandOrePriceAt` of all
 * their ore units, worth and pace both of the planet they are bought on, rounded once.
 */
export function chargePrice(size: number, count: number, planetIndex: number): Money {
  const { band, oreUnits } = chargeCostOf(size)
  const bought = { band, oreUnits: mul(fromSafeInteger(count), oreUnits) }
  return bandOrePriceAt(bought, planetIndex, planetIndex)
}

/** The self hit grows with the radius: `r(n) / r(1)`, 1 for size 1 (#143 "Self-hit"). */
export function selfHitScaleOf(size: number): BigStat {
  return div(radiusTilesOf(size), sizes.radius[0])
}

function radiusTilesOf(size: number): BigStat {
  return sizes.radius[indexOfSize(size)]
}

function indexOfSize(size: number): number {
  return sizeOf(size) - 1
}

function sizeOf(size: number): number {
  if (isChargeSize(size)) return size
  throw new RangeError(`a charge size is 1 to ${chargeSizeCount()}, got ${size}`)
}
