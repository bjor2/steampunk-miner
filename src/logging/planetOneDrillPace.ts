/**
 * The planet 1 drill pace of a bot run (ticket 396: the GD ruling and the VS amendment on Bjor's
 * 8 Oct no-cap ruling): the band-1 cells a second the bot's drill cuts at the start, when it first
 * breaks a band-3 tile of planet 1 (real depth, #4 band thresholds), and when it arrives on planet
 * 2. Band 1 of planet 1 is the felt speed Systems' rows are priced on, so the speed is the drill
 * law's exact sub-step time for one such cell at the vehicle's levels then. Derived from the run
 * events only; the floats never enter the log.
 *
 * Printed, not gated, since ticket 552: VS (#551, 6254600977) and the GD ruling (6254611358)
 * supersede #396 for `drill_power`, and #551's per-planet bars (`drillPaceBars.ts`) replace its
 * drill bars. Under the per-purchase law a band-3 tile can come before the seventh purchase.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../constants/balance'
import { PACING_TARGETS } from '../constants/pacingTargets'
import { TICKS_PER_SECOND } from '../constants/physics'
import { UPGRADE_IDS, type UpgradeId } from '../systems/economy/economyDefinition'
import { blockHardness } from '../systems/economy/oreEconomy'
import { startLevels, vehicleStatsAt, type UpgradeLevels } from '../systems/economy/vehicleStats'
import { subStepsPerTile } from '../systems/vehicle/drillRule'
import { bandOfTile } from '../systems/world/planetGeometry'
import { planetParamsFor } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import type { RunEvent } from './runEvent'

export interface PlanetOneDrillPace {
  startCellsPerSecond: number
  /** At the first band-3 tile the bot broke on planet 1; null if it never dug that deep. */
  bandThreeCellsPerSecond: number | null
  /** On arriving at planet 2; null if the run never left planet 1. */
  departureCellsPerSecond: number | null
}

const FIRST_PLANET = 1
const BAND_THREE = 3

export function derivePlanetOneDrillPace(
  events: readonly RunEvent[],
  worldSeed: number,
): PlanetOneDrillPace {
  const levels: Record<UpgradeId, number> = { ...startLevels() }
  const pace: PlanetOneDrillPace = {
    startCellsPerSecond: bandOneCellsPerSecond(levels),
    bandThreeCellsPerSecond: null,
    departureCellsPerSecond: null,
  }
  for (const event of events) foldDrillPaceEvent(pace, levels, event, worldSeed)
  return pace
}

function foldDrillPaceEvent(
  pace: PlanetOneDrillPace,
  levels: Record<UpgradeId, number>,
  event: RunEvent,
  worldSeed: number,
): void {
  if (isEventNamed(event, 'upgrade_purchased')) raiseTrack(levels, event)
  if (pace.bandThreeCellsPerSecond === null && isBandThreeOfPlanetOne(event, worldSeed)) {
    pace.bandThreeCellsPerSecond = bandOneCellsPerSecond(levels)
  }
  if (pace.departureCellsPerSecond === null && isArrivalPastPlanetOne(event)) {
    pace.departureCellsPerSecond = bandOneCellsPerSecond(levels)
  }
}

function raiseTrack(levels: Record<UpgradeId, number>, event: RunEvent<'upgrade_purchased'>): void {
  const track = UPGRADE_IDS.find((id) => id === event.data.upgradeId)
  if (track !== undefined) levels[track] = event.data.toLevel
}

function isBandThreeOfPlanetOne(event: RunEvent, worldSeed: number): boolean {
  const cell = brokenCellOf(event)
  if (cell === null || event.planet !== FIRST_PLANET) return false
  const params = planetParamsFor(worldSeed, event.planet)
  return bandOfTile(params, cell.tx, cell.ty) >= BAND_THREE
}

/**
 * The tile a line broke first: a `tile_destroyed`'s, or a drill span's first cell (ticket 420),
 * whose cells share one band.
 */
function brokenCellOf(event: RunEvent): TilePoint | null {
  if (isEventNamed(event, 'tile_destroyed')) return { tx: event.data.tx, ty: event.data.ty }
  if (!isEventNamed(event, 'drill_cut') || event.data.first === undefined) return null
  return { tx: event.data.first[0], ty: event.data.first[1] }
}

function isArrivalPastPlanetOne(event: RunEvent): boolean {
  return isEventNamed(event, 'planet_entered') && event.planet > FIRST_PLANET
}

function isEventNamed<N extends RunEvent['event']>(event: RunEvent, name: N): event is RunEvent<N> {
  return event.event === name
}

/**
 * The pace of the median seed on each of the three speeds (#84): the slower of the two middle
 * ones for an even count, and a seed that never got there counts as the slowest.
 */
export function medianPlanetOneDrillPace(paces: readonly PlanetOneDrillPace[]): PlanetOneDrillPace {
  return {
    startCellsPerSecond: medianSpeedOf(paces.map((pace) => pace.startCellsPerSecond)) ?? 0,
    bandThreeCellsPerSecond: medianSpeedOf(paces.map((pace) => pace.bandThreeCellsPerSecond)),
    departureCellsPerSecond: medianSpeedOf(paces.map((pace) => pace.departureCellsPerSecond)),
  }
}

function medianSpeedOf(speeds: readonly (number | null)[]): number | null {
  const slowestFirst = [...speeds].sort(bySlowestFirst)
  return slowestFirst[Math.floor((slowestFirst.length - 1) / 2)] ?? null
}

function bySlowestFirst(a: number | null, b: number | null): number {
  if (a === null || b === null) return (a === null ? 0 : 1) - (b === null ? 0 : 1)
  return a - b
}

/** Band-1 cells of planet 1 a second at `levels`, in the drill law's exact sub-step time. */
export function bandOneCellsPerSecond(levels: UpgradeLevels): number {
  const hardness = blockHardness(FIRST_PLANET, 1)
  const subSteps = subStepsPerTile(vehicleStatsAt(levels), hardness)
  return subSteps === null ? 0 : (DRILL_SUBSTEPS_PER_TICK * TICKS_PER_SECOND) / subSteps
}

/** What the run misses of #396's planet 1 drill speeds: 3x the start by band 3, 10 cells/s on leaving. */
export function planetOneDrillPaceAlerts(pace: PlanetOneDrillPace): string[] {
  return [...bandThreeAlerts(pace), ...departureAlerts(pace)]
}

function bandThreeAlerts(pace: PlanetOneDrillPace): string[] {
  const { bandThreeSpeedupMin } = PACING_TARGETS.planet1Drill
  const wanted = pace.startCellsPerSecond * bandThreeSpeedupMin
  if (pace.bandThreeCellsPerSecond === null) return ['planet 1 band 3 never reached']
  if (pace.bandThreeCellsPerSecond >= wanted) return []
  return [
    `planet 1 band 3 reached at ${cellsText(pace.bandThreeCellsPerSecond)} band-1 cells/s, ` +
      `target at least ${bandThreeSpeedupMin}x the start (${cellsText(wanted)})`,
  ]
}

function departureAlerts(pace: PlanetOneDrillPace): string[] {
  const { departureCellsPerSecondMin } = PACING_TARGETS.planet1Drill
  if (pace.departureCellsPerSecond === null) return ['planet 1 never left']
  if (pace.departureCellsPerSecond >= departureCellsPerSecondMin) return []
  return [
    `planet 1 left at ${cellsText(pace.departureCellsPerSecond)} band-1 cells/s, ` +
      `target at least ${departureCellsPerSecondMin}`,
  ]
}

function cellsText(cellsPerSecond: number): string {
  return cellsPerSecond.toFixed(2)
}
