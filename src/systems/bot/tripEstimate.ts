/**
 * The bot's planning model (#29 Systems & Economy note 3, after the #6 simulator): the money per
 * tick an ore trip to each band would earn with given upgrade levels, from the movement-time model
 * and the expected ore of a gallery (one unit per bored tile at the band's ore density). Used to pick the trip and to rank upgrades by marginal gain per price. A plan, not a
 * rule: approximate floats are fine here, and nothing it returns reaches the authority.
 */
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { vehicleStatsAt, type UpgradeLevels, type VehicleStats } from '../economy/vehicleStats'
import { toCanonical, type Money } from '../money'
import { ticksPerTile } from '../vehicle/drillRule'
import { quantaOfUnits } from '../vehicle/energyQuanta'
import { statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import { coreHardness } from '../economy/oreEconomy'
import { boreQuanta, hardnessAt, moveQuanta, moveTicks } from './botWorld'
import { galleryOf, shaftTileAt, type MineLayout } from './mineLayout'
import { nextRow } from './tripGoal'

/** What a trip has to work with: the vehicle's stats and the energy in its tank. */
export interface TripMeans {
  stats: VehicleStats
  tankQuanta: number
}

export interface OrePlan {
  band: number
  moneyPerTick: number
}

/** The hold is never planned past this share of the tank, as the bot turns back early (#33). */
const PLANNED_TANK_SHARE = 0.8
/** Docking, selling and buying, in ticks, per trip. */
const DOCK_OVERHEAD_TICKS = 120
const BASIS_POINTS = 10000
/** A core trip is planned only when the way there and back takes at most half the tank. */
const CORE_TRAVEL_SHARE_DENOMINATOR = 2
const BANDS = [1, 2, 3, 4, 5]

/** A vehicle with these levels and a full tank, as the workshop compares them. */
export function fullTankMeans(levels: UpgradeLevels): TripMeans {
  const stats = vehicleStatsAt(levels)
  return { stats, tankQuanta: quantaOfUnits(stats.energyMax) }
}

export function meansOfVehicle(vehicle: VehicleState): TripMeans {
  return { stats: statsOfVehicle(vehicle), tankQuanta: vehicle.energy }
}

/** The best ore band down to `deepestBand` to mine with these means, or null when none pays. */
export function bestOrePlan(
  layout: MineLayout,
  means: TripMeans,
  deepestBand = BANDS.length,
): OrePlan | null {
  const plans = BANDS.filter((band) => band <= deepestBand).flatMap((band) => {
    const moneyPerTick = oreTripMoneyPerTick(layout, means, band)
    return moneyPerTick === null ? [] : [{ band, moneyPerTick }]
  })
  return plans.reduce<OrePlan | null>(
    (best, plan) => (best === null || plan.moneyPerTick > best.moneyPerTick ? plan : best),
    null,
  )
}

/** Ticks the drill takes per core tile; null when the tip cannot scratch them (#7). */
function coreTicksPerTile(levels: UpgradeLevels, planetIndex: number): number | null {
  return ticksPerTile(vehicleStatsAt(levels), coreHardness(planetIndex))
}

/** Whether the drill digs core at least as fast as `maxTicksPerTile` allows. */
export function isCoreDugWithin(
  levels: UpgradeLevels,
  planetIndex: number,
  maxTicksPerTile: number,
): boolean {
  const ticks = coreTicksPerTile(levels, planetIndex)
  return ticks !== null && ticks <= maxTicksPerTile
}

/** Whether the shaft can be bored to the core and the way there and back takes half the tank. */
export function canReachCore(layout: MineLayout, { stats, tankQuanta }: TripMeans): boolean {
  const row = nextRow(layout, { kind: 'core' })
  if (row === null) return false
  const deepest = hardnessAt(layout.params, shaftTileAt(layout, row + 1), 'ground')
  const boreTicksThere = ticksPerTile(stats, deepest)
  if (boreTicksThere === null) return false
  const travel = travelOf(layout, stats, row, boreTicksThere)
  return travel.quanta * CORE_TRAVEL_SHARE_DENOMINATOR <= tankQuanta
}

function oreTripMoneyPerTick(
  layout: MineLayout,
  { stats, tankQuanta }: TripMeans,
  band: number,
): number | null {
  const row = nextRow(layout, { kind: 'ore', band })
  if (row === null) return null
  const boreTicksHere = ticksPerTile(
    stats,
    hardnessAt(layout.params, shaftTileAt(layout, row), 'ground'),
  )
  if (boreTicksHere === null) return null
  const travel = travelOf(layout, stats, row, boreTicksHere)
  const gallery = galleryYield(layout, band, boreTicksHere)
  const tankLeft = tankQuanta * PLANNED_TANK_SHARE - travel.quanta
  const galleryTiles = Math.min(
    stats.cargoCapacity / gallery.unitsPerTile,
    tankLeft / gallery.quantaPerTile,
  )
  if (galleryTiles <= 0) return null
  const money = galleryTiles * gallery.unitsPerTile * gallery.unitValue
  return money / (travel.ticks + galleryTiles * gallery.ticksPerTile + DOCK_OVERHEAD_TICKS)
}

interface TravelCost {
  ticks: number
  quanta: number
}

/** There and back: along the surface, down and up the open shaft, bore the rest, walk the gallery. */
function travelOf(
  layout: MineLayout,
  stats: VehicleStats,
  row: number,
  boreTicksHere: number,
): TravelCost {
  const speed = stats.engine.speedMax
  const gallery = galleryOf(layout, row)
  const walk =
    Math.abs(layout.shaftColumn - layout.sellBay.tx) + Math.min(gallery.east, gallery.west)
  const openDepth = layout.travelRow - Math.max(row, layout.shaftBottomRow)
  const toBore = Math.max(0, layout.shaftBottomRow - row)
  const climb = moveTicks(layout.travelRow - row, speed)
  const drive = 2 * moveTicks(walk, speed) + moveTicks(openDepth, speed)
  const bore = toBore * boreTicksHere
  return {
    ticks: drive + climb + bore,
    quanta: moveQuanta(drive, climb) + boreQuanta(bore),
  }
}

interface GalleryYield {
  unitsPerTile: number
  unitValue: number
  ticksPerTile: number
  quantaPerTile: number
}

function galleryYield(layout: MineLayout, band: number, boreTicksHere: number): GalleryYield {
  return {
    unitsPerTile: layout.params.oreDensityBp[band - 1] / BASIS_POINTS,
    unitValue: approximately(oreSalePrice(oreTier(layout.params.planetIndex, band))),
    ticksPerTile: boreTicksHere,
    quantaPerTile: boreQuanta(boreTicksHere),
  }
}

/** A Money as a float, for planning only; the canonical text parses to the nearest double. */
export function approximately(amount: Money): number {
  return Number.parseFloat(toCanonical(amount))
}
