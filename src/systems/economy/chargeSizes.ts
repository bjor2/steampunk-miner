/**
 * The dynamite size ladder (#143 numbers with amendments 2 and 3, #153 design and amendments, the
 * Game Director, Technical Director and Systems locks on #149, K8 #218). Sizes run from 1 to
 * `chargeSizeCount()`; size 1 is the shipped `blasting_charges` charge (#109) with all its numbers.
 *
 *   radius        `sizes.radius[n - 1]` tiles: 2.5 3.5 4.5 6 8 10 13 16 20 24, the only ladder
 *   unlock        planet 7 + 3 (n - 1); largest size s(p) = min(10, 1 + floor((p - 7) / 3))
 *   price         ceilMilli(count * 2 * 1.8^(n - 1) * V(t(p, 5)) * paceScale(p)), the `bandOre`
 *                 price, never its raw worth (Systems on #218)
 *   kept          0.4 * 0.8^(n - 1) of the ordinary ore the blast breaks
 *   rack slots    1 1 1 2 2 3 4 5 6 8
 *   fuse          120 120 120 150 180 210 ticks; sizes 7-10 are remote, fired by the plunger
 *                 (#149) and disarmed 3600 ticks after planting (#153)
 *   self hit      selfHit(p) * r(n) / r(1); from size 4 the inner half of the radius wrecks
 *   minCharge     clamp(s(p) - 2 + lead, 1, band) for a dynamite-gated cell (#143 amendment 2)
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
import { bandOrePrice } from './bandOreCost'
import { growGeometric } from './curveFamilies'
import { ECONOMY } from './economy'

const { sizes } = ECONOMY.blastingCharges
const MM_PER_TILE = fromSafeInteger(MM_PER_METRE)

/** One size of the ladder as #143 reads it (`chargeSpec(n, p)`), priced for one charge on `p`. */
export interface ChargeSpec {
  size: number
  radiusMm: number
  unlockPlanet: number
  price: Money
  keptFraction: BigStat
  rackSlots: number
  /** Ticks from plant to blast, or null for a remote charge only the plunger fires. */
  fuseTicks: number | null
}

/** A dynamite-gated ore cell as `minChargeFor` reads it: its rarity lead (+1, +2) and its band. */
export interface DynamiteGatedCell {
  lead: number
  band: number
}

export function chargeSpec(size: number, planetIndex: number): ChargeSpec {
  return {
    size,
    radiusMm: chargeRadiusMm(size),
    unlockPlanet: sizeUnlockPlanet(size),
    price: chargePrice(size, 1, planetIndex),
    keptFraction: keptFractionOf(size),
    rackSlots: rackSlotsOf(size),
    fuseTicks: fuseTicksOf(size),
  }
}

/** The smallest size that frees a dynamite-gated cell whole, capped by its band (#143 am. 2). */
export function minChargeFor(cell: DynamiteGatedCell, planetIndex: number): number {
  const wanted = largestSizeOn(planetIndex) - sizes.newestSizeLead + cell.lead
  return Math.min(Math.max(wanted, 1), cell.band)
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

export function sizeUnlockPlanet(size: number): number {
  return sizes.unlockFrom + sizes.unlockEvery * indexOfSize(size)
}

/** s(p): the largest size open on planet `planetIndex`, 0 before charges open. */
export function largestSizeOn(planetIndex: number): number {
  if (planetIndex < sizes.unlockFrom) return 0
  const opened = 1 + Math.floor((planetIndex - sizes.unlockFrom) / sizes.unlockEvery)
  return Math.min(opened, chargeSizeCount())
}

/**
 * Whether size `size` is still closed on planet `planetIndex`. Size 1 never is: it is the shipped
 * charge, closed where it is sold (`blasting_charges` opens on planet 7), so a rack carries and
 * plants it anywhere as before.
 */
export function isSizeLockedOn(size: number, planetIndex: number): boolean {
  return size > 1 && planetIndex < sizeUnlockPlanet(size)
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

export function rackSlotsOf(size: number): number {
  return sizes.rackSlots[indexOfSize(size)]
}

/** Ore units of band `oreUnitsBand` one charge of this size costs. */
export function chargeOreUnits(size: number): BigStat {
  return growGeometric(sizes.oreUnitsBase, sizes.oreUnitsRatio, indexOfSize(size))
}

/** `count` charges of `size` bought on planet `planetIndex`, rounded once like every buy. */
export function chargePrice(size: number, count: number, planetIndex: number): Money {
  const oreUnits = mul(fromSafeInteger(count), chargeOreUnits(size))
  return bandOrePrice({ band: sizes.oreUnitsBand, oreUnits }, planetIndex)
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
