/**
 * Places and moves the blasting charge specs share (#109), on planet 1 of the scripted session's
 * seed: the vehicle stands in the cave-free band-2 rock of the collapse specs and plants on the
 * tile east of it, with enemies frozen and a rack of three charges.
 */
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import type { CommandIntent } from '../authorityCommand'
import { BAND_2_Y, poseAt } from '../collapse/collapseFixtures'
import type { DomainEvent } from '../domainEvent'
import { FREEZE_ENEMIES, type ScriptedSession } from '../scriptedSession'

const MM_PER_TILE = 1000
const HALF_TILE_MM = MM_PER_TILE / 2

/** The tile the specs' vehicle stands on, deep in band-2 rock, and the wall east of it. */
export const STAND_TILE: TilePoint = { tx: -21, ty: Math.floor(BAND_2_Y / MM_PER_TILE) }
export const WALL_TILE: TilePoint = { tx: STAND_TILE.tx + 1, ty: STAND_TILE.ty }
/** Four tiles back west of the wall: out of the 2.5-tile blast. */
export const BACKED_OFF_TILE: TilePoint = { tx: WALL_TILE.tx - 4, ty: WALL_TILE.ty }

export const PLANT: CommandIntent<'plantCharge'> = { type: 'plantCharge', payload: {} }

export function setChargesIntent(
  carried: number,
  slotLevel = 0,
): CommandIntent<'debug.setCharges'> {
  return { type: 'debug.setCharges', payload: { carried, slotLevel } }
}

/** A pose report with the vehicle's centre on `tile`'s centre, facing `facing`. */
export function poseOnTile(tile: TilePoint, facing: Facing = FACING.right) {
  return poseAt(
    tile.tx * MM_PER_TILE + HALF_TILE_MM,
    tile.ty * MM_PER_TILE + HALF_TILE_MM,
    0,
    facing,
  )
}

/** Frozen enemies, three charges, the vehicle on the stand tile facing the wall. */
export function prepareBlaster(session: ScriptedSession, tick: number): void {
  session.submit(tick, FREEZE_ENEMIES)
  session.submit(tick, setChargesIntent(3))
  session.submit(tick, poseOnTile(STAND_TILE))
}

/** Plants on the wall from the stand tile; answers the plant's events. */
export function plantOnWall(session: ScriptedSession, tick: number): DomainEvent[] {
  session.submit(tick, poseOnTile(STAND_TILE))
  return session.submit(tick, PLANT)
}

export const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)
