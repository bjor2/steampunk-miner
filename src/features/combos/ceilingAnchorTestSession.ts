/**
 * Spec plumbing for the ceiling anchor (ticket 288), on the loaded slices: a planet-1 session with
 * the grav anchor in `powerup.1` and the twin bit in `drill.head`, the combo owned or not, the
 * anchor switched on or not, and the cells the bit's diagonals reach from a reported pose. Set up
 * through `debug.*` commands like a start scenario. Only specs use it.
 */
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import type { AheadBearing } from '../../systems/economy/drillGearCaps'
import { drillGearCellsAt } from '../../systems/vehicle/drillGearCells'
import { drillStampOf } from '../../systems/vehicle/drillStamp'
import type { DriveSign, DriveSigns } from '../../systems/vehicle/driveSigns'
import { FACING, type Facing, type VehiclePose } from '../../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../systems/world/cellYield'
import type { TilePoint } from '../../systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../../systems/world/worldState'
import { intentToUseSlot } from '../power-up-core'
import { CEILING_ANCHOR_ID } from './systems/ceilingAnchor'

/** Band-1 ground six rows under the surface east of the dock (`drillGearCut.test.ts`). */
export const TARGET: TilePoint = { tx: 30, ty: 285 }

export const GRAV_ANCHOR = 'power.grav_anchor'
export const TWIN_BIT = 'gear.twin_bit'
export const ANCHOR_SLOTS: Readonly<Record<string, string>> = {
  'powerup.1': GRAV_ANCHOR,
  'drill.head': TWIN_BIT,
}

export interface AnchorSetup {
  slots?: Readonly<Record<string, string>>
  owned?: readonly string[]
  isAnchored?: boolean
  target?: TilePoint
  facing?: Facing
  playerId?: string
}

/** Lifting with a side pushed: 1 the screen's right facing up. */
export const lifting = (x: DriveSign): DriveSigns => ({ x, y: 1 })

/** Drilling down with a side pushed: 1 the vehicle's right. */
export const pushingDown = (x: DriveSign): DriveSigns => ({ x, y: -1 })

export const toggleAnchor = () => intentToUseSlot('powerup.1')

/** A session at tick 2 with the anchor rig set up for `playerId` over `target`. */
export function anchorSession(setup: AnchorSetup = {}): ScriptedSession {
  return setUpAnchorRig(createScriptedSession(['p1', 'p2']), setup)
}

/** Sets up `setup.playerId`'s rig in `session` at ticks 0-2: loadout, pose, anchor. */
export function setUpAnchorRig(session: ScriptedSession, setup: AnchorSetup): ScriptedSession {
  const { slots = ANCHOR_SLOTS, owned = [CEILING_ANCHOR_ID], isAnchored = true } = setup
  const { target = TARGET, facing = FACING.up, playerId = 'p1' } = setup
  session.submit(0, setVehicleLoadoutCommand(slots, owned), playerId)
  session.submit(1, poseAbove(target, facing), playerId)
  if (isAnchored) session.submit(2, toggleAnchor(), playerId)
  return session
}

/** One drill report of `drillTicks` ending at `tick`, over `target`. */
export function drillAt(
  session: ScriptedSession,
  tick: number,
  drive: DriveSigns,
  options: { target?: TilePoint; facing?: Facing; drillTicks?: number; playerId?: string } = {},
) {
  const { target = TARGET, facing = FACING.up, drillTicks = 1, playerId = 'p1' } = options
  return session.submit(tick, poseAbove(target, facing, { drillTicks, drive }), playerId)
}

/** The pose `poseAbove` reports, as the authority reads it. */
export function poseOver(tile: TilePoint, facing: Facing): VehiclePose {
  const { x, y, vx, vy, upx, upy } = poseAbove(tile, facing).payload
  return { x, y, vx, vy, upx, upy, facing }
}

/** The first cell past the bit over `target` along `bearing`: the diagonal cell off the facing. */
export function aheadCellOf(target: TilePoint, facing: Facing, bearing: AheadBearing): TilePoint {
  const pose = poseOver(target, facing)
  const reach = { aheadCells: 1, sideCells: 0, aheadBearing: bearing }
  return drillGearCellsAt(pose, drillStampOf(pose, false), reach).ahead[0]
}

export function densityOf(world: WorldState, tile: TilePoint): number {
  return cellDensitySum(world, PARAMS, tile)
}

/** The density a cell stands at before anything cut it. */
export function freshDensityOf(tile: TilePoint): number {
  return densityOf(EMPTY_WORLD, tile)
}
