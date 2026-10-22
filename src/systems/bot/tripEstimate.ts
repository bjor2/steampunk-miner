/**
 * The bot's planning model (#29 Systems & Economy note 3, after the #6 simulator): the money per
 * tick an ore trip to each band would earn with given upgrade levels, from the movement-time model
 * and the expected ore of a gallery (one unit per bored tile at the band's ore density). Used to pick the trip and to rank upgrades by marginal gain per price. A plan, not a
 * rule: the ore units a tick hauls are an approximate float, bounded by the vehicle, and nothing
 * it returns reaches the authority. The ore price grows without bound and stays Money: as a double
 * it is Infinity past planet 582 (#196). A bored tile takes its time on the scripted sub-step
 * clock the bot bores on (ticket 559), a fraction of a tick past 60 cells/s, so a drill purchase
 * that shortens a tile by less than a tick plans its gain. A gallery tile is cut sideways, so it
 * takes at least the drive's time over it (Bjor's ruling on #723); the shaft down is the drill's.
 */
import { oreSalePrice, oreTier } from '../economy/oreEconomy'
import { vehicleStatsAt, type UpgradeLevels, type VehicleStats } from '../economy/vehicleStats'
import { cmp, fromFiniteNumber, mul, type BigStat, type Money } from '../money'
import { sidewaysSubStepsOf } from '../vehicle/cutCapSpeed'
import { subStepsPerTileAt, ticksPerTile, type DrillStats } from '../vehicle/drillRule'
import { drillQuantumOnPlanet } from '../vehicle/drillQuantum'
import { quantaOfUnits } from '../vehicle/energyQuanta'
import { statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import { blockHardness, coreHardness } from '../economy/oreEconomy'
import { boreQuanta, groundHardnessAt, moveQuanta, moveTicks } from './botWorld'
import { galleryOf, shaftTileAt, type MineLayout } from './mineLayout'
import { nextRow } from './tripGoal'

/** What a trip has to work with: the vehicle's stats and the energy in its tank. */
export interface TripMeans {
  stats: VehicleStats
  tankQuanta: number
}

export interface OrePlan {
  band: number
  moneyPerTick: Money
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
  return orePlansOf(layout, means, deepestBand).reduce<OrePlan | null>(
    (best, plan) => (best === null || cmp(plan.moneyPerTick, best.moneyPerTick) > 0 ? plan : best),
    null,
  )
}

/** Every ore band down to `deepestBand` that pays with these means, shallowest first. */
export function orePlansOf(
  layout: MineLayout,
  means: TripMeans,
  deepestBand = BANDS.length,
): OrePlan[] {
  return BANDS.filter((band) => band <= deepestBand).flatMap((band) => {
    const moneyPerTick = oreTripMoneyPerTick(layout, means, band)
    return moneyPerTick === null ? [] : [{ band, moneyPerTick }]
  })
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
  const deepest = groundHardnessAt(layout.params, shaftTileAt(layout, row + 1))
  const boreTicksThere = tileTicksOf(stats, deepest, layout.params.planetIndex)
  if (boreTicksThere === null) return false
  const travel = travelOf(layout, stats.engine.speedMax, row, boreTicksThere)
  return travel.quanta * CORE_TRAVEL_SHARE_DENOMINATOR <= tankQuanta
}

function oreTripMoneyPerTick(layout: MineLayout, means: TripMeans, band: number): Money | null {
  const unitsPerTick = oreTripUnitsPerTick(layout, means, band)
  return unitsPerTick === null
    ? null
    : mul(oreUnitValue(layout, band), fromFiniteNumber(unitsPerTick))
}

/** The ore units a trip to the band hauls per tick of the round trip; null when none. */
function oreTripUnitsPerTick(layout: MineLayout, means: TripMeans, band: number): number | null {
  const trip = galleryTripOf(layout, means, band)
  if (trip === null) return null
  const galleryTiles = Math.min(trip.tilesByHold, trip.tilesByTank)
  if (galleryTiles <= 0) return null
  const units = galleryTiles * trip.gallery.unitsPerTile
  const ticks = trip.travel.ticks + galleryTiles * trip.gallery.ticksPerTile + DOCK_OVERHEAD_TICKS
  return units / ticks
}

/**
 * The share of a full hold a trip to the band loads before its planned tank share turns it home,
 * 0 to 1; null where the band has no row left, no ore, or the tip cannot cut it. Below 1 the tank, not the
 * hold, ends the trip (Systems' boiler rule on #553, ticket 553).
 */
export function holdShareLoadedOf(
  layout: MineLayout,
  means: TripMeans,
  band: number,
): number | null {
  const trip = galleryTripOf(layout, means, band)
  if (trip === null || !Number.isFinite(trip.tilesByHold)) return null
  return Math.min(1, Math.max(0, trip.tilesByTank / trip.tilesByHold))
}

/** A trip to a band's next gallery row: its travel, the gallery's yield and what ends the dig. */
interface GalleryTrip {
  travel: TravelCost
  gallery: GalleryYield
  /** Gallery tiles a full hold takes, and the tiles the planned tank share pays for. */
  tilesByHold: number
  tilesByTank: number
}

function galleryTripOf(
  layout: MineLayout,
  { stats, tankQuanta }: TripMeans,
  band: number,
): GalleryTrip | null {
  const row = nextRow(layout, { kind: 'ore', band })
  if (row === null) return null
  const boreTicksHere = tileTicksOf(
    stats,
    groundHardnessAt(layout.params, shaftTileAt(layout, row)),
    layout.params.planetIndex,
  )
  if (boreTicksHere === null) return null
  const oreTicks = oreTileTicksOf(stats, layout, band)
  if (oreTicks === null) return null
  const travel = travelOf(layout, stats.engine.speedMax, row, boreTicksHere)
  const gallery = galleryYield(layout, band, {
    rock: sidewaysTileTicksOf(stats, boreTicksHere, layout.params.planetIndex),
    ore: sidewaysTileTicksOf(stats, oreTicks, layout.params.planetIndex),
  })
  const tankLeft = tankQuanta * PLANNED_TANK_SHARE - travel.quanta
  return {
    travel,
    gallery,
    tilesByHold: stats.cargoCapacity / gallery.unitsPerTile,
    tilesByTank: tankLeft / gallery.quantaPerTile,
  }
}

/**
 * A tile's drill time in ticks on the scripted clock (ticket 559): its sub-steps in the rig's
 * drill quantum over the quantum, unrounded; null when the tip cannot scratch it.
 */
function tileTicksOf(drill: DrillStats, hardness: BigStat, planetIndex: number): number | null {
  const quantum = drillQuantumOnPlanet(drill, planetIndex)
  const subSteps = subStepsPerTileAt(quantum, drill, hardness)
  return subSteps === null ? null : subSteps / quantum
}

/** A tile of the band's own ore: its tier hardness, which the surface layer never softens. */
function oreTileTicksOf(drill: DrillStats, layout: MineLayout, band: number): number | null {
  const { planetIndex } = layout.params
  return tileTicksOf(drill, blockHardness(planetIndex, band), planetIndex)
}

interface TravelCost {
  ticks: number
  quanta: number
}

/**
 * A gallery tile's ticks cut sideways: the drill's `drillTicks`, or the drive's over the tile where
 * the drive is slower (ticket 723), on the same scripted clock the bot bores on.
 */
function sidewaysTileTicksOf(stats: VehicleStats, drillTicks: number, planetIndex: number): number {
  const quantum = drillQuantumOnPlanet(stats, planetIndex)
  return sidewaysSubStepsOf(drillTicks * quantum, stats.engine.speedMax, quantum) / quantum
}

/** There and back at `speed` m/s: the surface, the open shaft, bore the rest, walk the gallery. */
function travelOf(
  layout: MineLayout,
  speed: number,
  row: number,
  boreTicksHere: number,
): TravelCost {
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
  ticksPerTile: number
  quantaPerTile: number
}

/** Ticks to bore one gallery tile of the row's rock, and one of the band's own ore. */
interface GalleryTileTicks {
  rock: number
  ore: number
}

/**
 * A gallery tile's ticks: its rock, and its ore at the band's density. A band's rock and its own
 * ore are equally hard, so before the surface layer (ticket 625) every tile cost the rock's; in
 * that layer the rock is soft and the ore keeps its tier hardness, so the ore that pays is dearer.
 */
function galleryYield(layout: MineLayout, band: number, ticks: GalleryTileTicks): GalleryYield {
  const unitsPerTile = layout.params.oreDensityBp[band - 1] / BASIS_POINTS
  const ticksPerTile = ticks.rock + unitsPerTile * (ticks.ore - ticks.rock)
  return { unitsPerTile, ticksPerTile, quantaPerTile: boreQuanta(ticksPerTile) }
}

function oreUnitValue(layout: MineLayout, band: number): Money {
  return oreSalePrice(oreTier(layout.params.planetIndex, band))
}
