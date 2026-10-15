/**
 * The drill-speed ladder's headless cut (ticket 409): a rig parked on the planet 1 surface of the
 * spec seed, facing down, cuts a fixed number of ground cells straight down its column through the
 * authority's swept cut, at one `drill_power` major (the level #396's 1.12x a level counts; a stored
 * level is a step of ten pips). It reports the ticks until the last of those
 * cells broke, so the ladder compares levels on the same ground with the #396 drill law and #399's
 * exact carry (no whole-tick rounding per cell).
 *
 * Motion is left out: after its first, resting tick the pose sits past the column's foot, so every
 * tick's reach is its work's alone. #397's cut-follow adds the vehicle's travel time to the ladder.
 */
import { stepOfMajor } from '../economy/upgradeSteps'
import { energyMax } from '../economy/vehicleStats'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { materialCellAt } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import { drillAlongStep } from './drillStepCut'
import { planetParamsOf } from './planetOfState'
import { createScriptedSession, FREEZE_ENEMIES, GROUND, poseAbove } from './scriptedSession'

/** One level's cut down the column. */
export interface DrillLadderRung {
  level: number
  cells: number
  ticks: number
}

/** The ground the ladder cuts: the scripted sessions' planet 1 band-1 surface column. */
export const LADDER_COLUMN = GROUND.tx

/** A full tank and a hold (in majors) no column empties or fills, so only the drill sets the time. */
const DEEP_TANK_MAJOR = 100
const HOLD_MAJOR = 300
/** Cells past the column's foot the pose waits at, so the stamp's centre crosses the last cell. */
const FOOT_OVERSHOOT_CELLS = 3
/** A cut that has not finished by now is stuck, never slow: about 28 minutes. */
const MAX_TICKS = 100_000

interface Rig {
  state: AuthorityState
  params: PlanetParams
  top: VehiclePose
}

/** Cuts `cellCount` ground cells down the ladder column at `drill_power` `level`. */
export function cutColumnAtDrillLevel(level: number, cellCount: number): DrillLadderRung {
  const rig = rigOnSurfaceAt(level)
  const cells = columnCellsBelow(rig, cellCount)
  return { level, cells: cells.length, ticks: ticksToBreakAll(rig, cells) }
}

/** The rig resting on the column's surface cell, facing down, with enemies frozen. */
function rigOnSurfaceAt(level: number): Rig {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setUpgrade('drill_power', stepOfMajor(level)))
  session.submit(0, setUpgrade('cargo_hold', stepOfMajor(HOLD_MAJOR)))
  session.submit(0, setUpgrade('boiler', stepOfMajor(DEEP_TANK_MAJOR)))
  session.submit(0, {
    type: 'debug.setEnergy',
    payload: { energy: `${energyMax(DEEP_TANK_MAJOR)}` },
  })
  session.submit(0, poseAbove(GROUND, FACING.down))
  const state = session.state()
  const params = planetParamsOf(state.planet) as PlanetParams
  return { state, params, top: vehicleOf(state, 'p1').pose as VehiclePose }
}

function setUpgrade(upgradeId: string, level: number) {
  return { type: 'debug.setUpgrade', payload: { upgradeId, level } } as const
}

/** The first `count` cells the drill can cut down the column, below the body's own cell. */
function columnCellsBelow({ state, params, top }: Rig, count: number): TilePoint[] {
  const cells: TilePoint[] = []
  for (let ty = Math.floor(top.y / 1000) - 1; cells.length < count; ty--) {
    const tile = { tx: LADDER_COLUMN, ty }
    if (isRemovableCell(materialCellAt(state.world, params, tile))) cells.push(tile)
  }
  return cells
}

/** Ticks of the swept cut, from its first, until every one of `cells` has broken. */
function ticksToBreakAll(rig: Rig, cells: readonly TilePoint[]): number {
  const standing = new Set(cells.map(tileKeyOf))
  const foot = footPoseOf(rig.top, cells)
  let state = rig.state
  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    const pose = tick === 1 ? rig.top : foot
    const ticked = { ...state, tick: rig.state.tick + tick }
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    const effect = drillAlongStep(ticked, rig.params, 'p1', noseTileOf(pose), step)
    removeBrokenCells(standing, effect.events)
    if (standing.size === 0) return tick
    state = effect.state
  }
  throw new Error(`the column still stood after ${MAX_TICKS} ticks`)
}

/** The resting pose moved down the column to a little past its last cell. */
function footPoseOf(top: VehiclePose, cells: readonly TilePoint[]): VehiclePose {
  const last = cells[cells.length - 1]
  return { ...top, y: (last.ty - FOOT_OVERSHOOT_CELLS) * 1000 + 500 }
}

function removeBrokenCells(standing: Set<string>, events: readonly DomainEventBody[]): void {
  for (const event of events) {
    if (event.type === 'TileDestroyed') standing.delete(tileKeyOf(event))
  }
}

function tileKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
