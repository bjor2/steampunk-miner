/**
 * The blast-or-drill trade of #109 (numbers acceptance 3), a model beside the bot's trip model
 * (`tripEstimate.ts`): for a vehicle in one band, the ore money a tick earns drilling the band's
 * tiles one at a time against blasting them 21 at a time (40% of their ore kept, one charge
 * paid, the fuse waited out from 3 tiles back), and the ticks to push a shaft 3 tiles deeper
 * either way. Approximate floats: a report, never a rule; nothing here reaches the authority.
 */
import { blastTilesAround } from '../authority/charges/blastOre'
import { blastReachTiles, chargeFuseTicks, restockPrice } from '../economy/blastingCharges'
import { ECONOMY } from '../economy/economy'
import { blockHardness, oreSalePrice, oreTier } from '../economy/oreEconomy'
import type { VehicleStats } from '../economy/vehicleStats'
import { ticksPerTile } from '../vehicle/drillRule'
import type { PlanetParams } from '../world/planetParams'
import { moveTicks } from './botWorld'
import { approximately } from './tripEstimate'

export interface BlastTrade {
  band: number
  drillTicksPerTile: number
  /** The drill time per tile over the `minTicksPerTile` floor. */
  floorMultiple: number
  drillMoneyPerTick: number
  blastMoneyPerTick: number
  /** Ticks to open the next 3 tiles down a shaft: drilling them, or one blast and the drive in. */
  drillAdvanceTicks: number
  blastAdvanceTicks: number
}

const BASIS_POINTS = 10000
const ONE_CHARGE = 1
const BLAST_TILES = blastTilesAround({ tx: 0, ty: 0 }).length
const KEPT_SHARE = approximately(ECONOMY.blastingCharges.oreYieldFraction)

/** The trade in `band` for a vehicle with `stats`; null where its drill cannot cut the band. */
export function blastTradeOf(
  params: PlanetParams,
  stats: VehicleStats,
  band: number,
): BlastTrade | null {
  const drillTicks = ticksPerTile(stats, blockHardness(params.planetIndex, band))
  if (drillTicks === null) return null
  const tileMoney = oreMoneyPerTile(params, band)
  const cycleTicks = blastCycleTicks(stats)
  const advanceTiles = blastReachTiles() + 1
  return {
    band,
    drillTicksPerTile: drillTicks,
    floorMultiple: drillTicks / ECONOMY.drill.minTicksPerTile,
    drillMoneyPerTick: tileMoney / drillTicks,
    blastMoneyPerTick: (BLAST_TILES * tileMoney * KEPT_SHARE - chargeMoney(params)) / cycleTicks,
    drillAdvanceTicks: advanceTiles * drillTicks,
    blastAdvanceTicks: cycleTicks + moveTicks(advanceTiles, stats.engine.speedMax),
  }
}

/** Expected ore money in one tile of the band: its ore density times its tier's sale price. */
function oreMoneyPerTile(params: PlanetParams, band: number): number {
  const density = params.oreDensityBp[band - 1] / BASIS_POINTS
  return density * approximately(oreSalePrice(oreTier(params.planetIndex, band)))
}

/** Plant, back off out of the blast, wait out the fuse, drive back. */
function blastCycleTicks(stats: VehicleStats): number {
  return chargeFuseTicks() + 2 * moveTicks(blastReachTiles(), stats.engine.speedMax)
}

function chargeMoney(params: PlanetParams): number {
  return approximately(restockPrice(ONE_CHARGE, params.planetIndex))
}
