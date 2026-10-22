/**
 * The drill-speed ladder's headless cut (ticket 409): a rig parked on the planet 1 surface of the
 * spec seed, facing down, cuts a fixed number of ground cells straight down its column through the
 * authority's swept cut, at one stored `drill_power` step (one purchase of the per-purchase law
 * since the GD ruling on #551, ticket 552). It reports the ticks until the last of those cells
 * broke, so the ladder compares levels on the same ground with the drill law and #399's exact
 * carry (no whole-tick rounding per cell).
 *
 * Motion is held to the cut: after its first, resting tick the pose moves toward a little past the
 * column's foot only as far as the ground ahead of its face is open (ticket 570: the stamp rides the
 * body's face, a step ahead of it, so a pose jumped past ground the cut never reached would cut
 * nothing). The front's step is the drill law's, so in rock every tick's reach is its work's alone.
 * A natural cave the column crosses is open ground the body drops through in one tick; the front
 * then crosses the cave's air at its catch-up pace (`sweptStampAt.ts`), a few ticks main's pose past
 * the foot never paid, more on a faster rig. #397's cut-follow adds the vehicle's travel time.
 *
 * The rig reports itself already moving down at its law's cut speed: the ladder measures the drill
 * law at steady state (L20 about 84 m/s on this bench, Bjor's ruling on #724), where from rest the
 * gravity ramp, not the drill, would set a fast rig's pace down the first cells.
 */
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
import { stepIntoOpenGround, type Point } from './faceHoldFixtures'
import { planetParamsOf } from './planetOfState'
import { createScriptedSession, FREEZE_ENEMIES, GROUND, poseAbove } from './scriptedSession'
import { movingDownAtCutSpeed } from './sweptRigFixtures'

/** One level's cut down the column. */
export interface DrillLadderRung {
  level: number
  cells: number
  ticks: number
}

/** The ground the ladder cuts: the scripted sessions' planet 1 band-1 surface column. */
export const LADDER_COLUMN = GROUND.tx

/**
 * A full tank and a hold no column empties or fills, so only the drill sets the time: boiler and
 * hold purchases (ticket 553) of 758 and 1,291 units, the old majors 100 and 300's 750 and 1,210.
 */
const DEEP_TANK_PURCHASES = 17
const HOLD_PURCHASES = 51
/** Cells past the column's foot the pose heads for, so the stamp's front crosses the last cell. */
const FOOT_OVERSHOOT_CELLS = 3
/** A cut that has not finished by now is stuck, never slow: about 28 minutes. */
const MAX_TICKS = 100_000

interface Rig {
  state: AuthorityState
  params: PlanetParams
  top: VehiclePose
}

/**
 * Cuts `cellCount` ground cells down the ladder column at stored `drill_power` `step`, the unit the
 * browser drill-down run and the status page's Drill speed panel count in (ticket 434) and the
 * drill's level since #552; the rung's `level` is that step.
 */
export function cutColumnAtDrillStep(step: number, cellCount: number): DrillLadderRung {
  const rig = rigOnSurfaceAt(step)
  const cells = columnCellsBelow(rig, cellCount)
  return { level: step, cells: cells.length, ticks: ticksToBreakAll(rig, cells) }
}

/** The rig resting on the column's surface cell, facing down, with enemies frozen. */
function rigOnSurfaceAt(drillStep: number): Rig {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setUpgrade('drill_power', drillStep))
  session.submit(0, setUpgrade('cargo_hold', HOLD_PURCHASES))
  session.submit(0, setUpgrade('boiler', DEEP_TANK_PURCHASES))
  session.submit(0, {
    type: 'debug.setEnergy',
    payload: { energy: `${energyMax(DEEP_TANK_PURCHASES)}` },
  })
  const report = poseAbove(GROUND, FACING.down)
  const moving = movingDownAtCutSpeed(session.state(), report.payload)
  session.submit(0, { ...report, payload: { ...report.payload, ...moving } })
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
  const foot = footOf(rig.top, cells)
  let state = rig.state
  let pose = rig.top
  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    if (tick > 1) pose = { ...pose, ...stepIntoOpenGround(state.world, rig.params, pose, foot) }
    const ticked = { ...state, tick: rig.state.tick + tick }
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    const effect = drillAlongStep(ticked, rig.params, 'p1', noseTileOf(pose), step)
    removeBrokenCells(standing, effect.events)
    if (standing.size === 0) return tick
    state = effect.state
  }
  throw new Error(`the column still stood after ${MAX_TICKS} ticks`)
}

/** A little past the column's last cell, below the resting pose. */
function footOf(top: VehiclePose, cells: readonly TilePoint[]): Point {
  const last = cells[cells.length - 1]
  return { x: top.x, y: (last.ty - FOOT_OVERSHOOT_CELLS) * 1000 + 500 }
}

function removeBrokenCells(standing: Set<string>, events: readonly DomainEventBody[]): void {
  for (const event of events) {
    if (event.type === 'TileDestroyed') standing.delete(tileKeyOf(event))
  }
}

function tileKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
