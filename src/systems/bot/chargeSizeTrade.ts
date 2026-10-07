/**
 * The dynamite ladder's blast-or-drill guard (#143 guard 1 and amendments 2 and 3, #153 amendment
 * point 4, K8 #218), beside the shipped charge's trade (`blastTrade.ts`): for a charge of each
 * size, on the planet it opens on and on planet 40, in each band, against a drill taking 24 and
 * 45 ticks a tile, the net ore money of one blast (the kept share of the ore in its radius less
 * the charge's price) over its cycle, against the drill's ore money a tick on the same ground.
 *
 * - At the band's ore density, blasting must earn no more a tick than drilling: the price holds
 *   it (`isBlastAboveDrill` is the guard).
 * - Centred on a full ore patch it may earn more (#143 amendment 2: sizes 1 and 2, bounded by the
 *   rack). The report shows every such case and never retunes from it.
 *
 * The cycle: plant from a tile next to the charge, back off out of the radius (a remote charge
 * one tile further, past the plunger's interlock, #153), wait out the fuse, drive back. A report
 * and a guard, never a rule; nothing here reaches the authority. Money stays Money (#196).
 */
import { inRadiusCount } from '../authority/charges/blastFront'
import {
  chargePrice,
  chargeRadiusMm,
  chargeReachTiles,
  chargeSizesUpTo,
  chargeSizeCount,
  fuseTicksOf,
  keptFractionOf,
  sizeUnlockPlanet,
} from '../economy/chargeSizes'
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { onCurveLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { cmp, div, fromSafeInteger, mul, sub, type Money } from '../money'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'
import { moveTicks } from './botWorld'

/** The drill speeds the guard compares at (#153 amendment point 4): the floor and a slow tile. */
export const GUARD_DRILL_TICKS_PER_TILE: readonly number[] = [24, 45]
/** The last authored planet (#143 amendment 2): every size is judged there too. */
export const GUARD_LAST_PLANET = 40
const BANDS = [1, 2, 3, 4, 5]
const BASIS_POINTS = 10000
const ONE_CHARGE = 1
/** The interlock keeps the planter one tile past the radius of a remote charge (#153). */
const INTERLOCK_TILES = 1

export interface ChargeSizeTrade {
  size: number
  planetIndex: number
  band: number
  drillTicksPerTile: number
  /** Plant, back off, the fuse, drive back. */
  cycleTicks: number
  /** At the band's ore density. */
  drillMoneyPerTick: Money
  blastMoneyPerTick: Money
  /** On a full patch: every tile in the radius, and every tile drilled, is ore. */
  patchDrillMoneyPerTick: Money
  patchBlastMoneyPerTick: Money
}

/** Every size at its unlock planet and planet 40, every band, at both drill speeds. */
export function chargeSizeTradesOf(worldSeed: number): ChargeSizeTrade[] {
  return chargeSizesUpTo(chargeSizeCount()).flatMap((size) =>
    guardPlanetsOf(size).flatMap((planetIndex) =>
      tradesOnPlanet(planetParamsFor(worldSeed, planetIndex), size),
    ),
  )
}

/** One size's trade in one band against a drill taking `drillTicksPerTile` ticks a tile. */
export function chargeSizeTradeOf(
  params: PlanetParams,
  size: number,
  band: number,
  drillTicksPerTile: number,
): ChargeSizeTrade {
  const cycleTicks = blastCycleTicks(size, params.planetIndex)
  const density = oreDensityOf(params, band)
  const oreValue = oreSalePrice(oreTier(params.planetIndex, band))
  return {
    size,
    planetIndex: params.planetIndex,
    band,
    drillTicksPerTile,
    cycleTicks,
    drillMoneyPerTick: perTick(mul(density, oreValue), drillTicksPerTile),
    blastMoneyPerTick: perTick(blastNetMoney(params, size, mul(density, oreValue)), cycleTicks),
    patchDrillMoneyPerTick: perTick(oreValue, drillTicksPerTile),
    patchBlastMoneyPerTick: perTick(blastNetMoney(params, size, oreValue), cycleTicks),
  }
}

/** The guard: at the band's density, a blast earns more a tick than the drill. */
export function isBlastAboveDrill(trade: ChargeSizeTrade): boolean {
  return cmp(trade.blastMoneyPerTick, trade.drillMoneyPerTick) > 0
}

/** Reported, not judged: centred on a full patch, a blast earns more a tick than the drill. */
export function isPatchBlastAboveDrill(trade: ChargeSizeTrade): boolean {
  return cmp(trade.patchBlastMoneyPerTick, trade.patchDrillMoneyPerTick) > 0
}

function guardPlanetsOf(size: number): number[] {
  return [sizeUnlockPlanet(size), GUARD_LAST_PLANET]
}

function tradesOnPlanet(params: PlanetParams, size: number): ChargeSizeTrade[] {
  return BANDS.flatMap((band) =>
    GUARD_DRILL_TICKS_PER_TILE.map((ticks) => chargeSizeTradeOf(params, size, band, ticks)),
  )
}

/** The kept share of the ore money in the blast's radius, less one charge of the size. */
function blastNetMoney(params: PlanetParams, size: number, oreMoneyPerTile: Money): Money {
  const tiles = fromSafeInteger(inRadiusCount(chargeRadiusMm(size)))
  const kept = mul(mul(tiles, oreMoneyPerTile), keptFractionOf(size))
  return sub(kept, chargePrice(size, ONE_CHARGE, params.planetIndex))
}

function blastCycleTicks(size: number, planetIndex: number): number {
  const fuseTicks = fuseTicksOf(size)
  const backOffTiles = chargeReachTiles(size) + (fuseTicks === null ? INTERLOCK_TILES : 0)
  const { speedMax } = vehicleStatsAt(onCurveLevels(planetIndex)).engine
  return (fuseTicks ?? 0) + 2 * moveTicks(backOffTiles, speedMax)
}

function oreDensityOf(params: PlanetParams, band: number): Money {
  return div(fromSafeInteger(params.oreDensityBp[band - 1]), fromSafeInteger(BASIS_POINTS))
}

function perTick(money: Money, ticks: number): Money {
  return div(money, fromSafeInteger(ticks))
}
