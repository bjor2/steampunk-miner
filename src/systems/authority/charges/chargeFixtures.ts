/**
 * Places and moves the blasting charge specs share (#109), on planet 1 of the scripted session's
 * seed: the vehicle stands in the cave-free band-2 rock of the collapse specs and plants on the
 * tile east of it, with enemies frozen and a rack of three charges. The size specs (K8 #218) stand
 * the same way in solid rock on the later planet their size opens on.
 */
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import { planetParamsFor } from '../../world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../world/tileGrid'
import { CELL_KIND, isSolidCell, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import type { CommandIntent } from '../authorityCommand'
import { BAND_2_Y, poseAt } from '../collapse/collapseFixtures'
import type { DomainEvent } from '../domainEvent'
import { resourceTierOf } from '../minedOre'
import { createAuthorityState } from '../authorityState'
import {
  continueScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'
import { blastTilesAround } from './blastOre'

const MM_PER_TILE = 1000
const HALF_TILE_MM = MM_PER_TILE / 2

/** The tile the specs' vehicle stands on, deep in band-2 rock, and the wall east of it. */
export const STAND_TILE: TilePoint = { tx: -21, ty: Math.floor(BAND_2_Y / MM_PER_TILE) }
export const WALL_TILE: TilePoint = { tx: STAND_TILE.tx + 1, ty: STAND_TILE.ty }
/** Four tiles back west of the wall: out of the 2.5-tile blast. */
export const BACKED_OFF_TILE: TilePoint = { tx: WALL_TILE.tx - 4, ty: WALL_TILE.ty }

export const PLANT: CommandIntent<'plantCharge'> = { type: 'plantCharge', payload: { size: 1 } }

/** A rack carrying only `carried` charges of `size` (the shipped size 1 unless named). */
export function setChargesIntent(
  carried: number,
  slotLevel = 0,
  size = 1,
): CommandIntent<'debug.setCharges'> {
  return { type: 'debug.setCharges', payload: { size, carried, slotLevel } }
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

/** A solid tile whose blast holds exactly five ore cells, all of one tier, in generated rock. */
export function fiveOreBlastSite(): { wall: TilePoint; tier: number } {
  for (let ty = STAND_TILE.ty - 30; ty <= STAND_TILE.ty + 30; ty++) {
    for (let tx = -60; tx <= 60; tx++) {
      const wall = { tx, ty }
      if (kindOfCell(cellAt(EMPTY_WORLD, PARAMS, wall)) !== CELL_KIND.ground) continue
      const ore = blastTilesAround(wall, 1)
        .map((tile) => cellAt(EMPTY_WORLD, PARAMS, tile))
        .filter((cell) => kindOfCell(cell) === CELL_KIND.ore)
      const tiers = new Set(ore.map((cell) => resourceTierOf(PARAMS, cell)))
      if (ore.length === 5 && tiers.size === 1) return { wall, tier: [...tiers][0] }
    }
  }
  throw new Error('no five-ore blast site in the scanned rock')
}

/** Where a sized charge spec stands on a later planet: solid rock, and a solid wall east of it. */
export interface BlastSite {
  stand: TilePoint
  wall: TilePoint
}

/**
 * A session on `planetIndex` (K8 #218 sizes open by planet), enemies frozen, a full rack carrying
 * `carried` charges of `size`, and the vehicle in band-1 rock facing a solid wall east of it.
 */
export function sizedBlasterOn(planetIndex: number, size: number, carried = 1) {
  const params = planetParamsFor(WORLD_SEED, planetIndex)
  const session = continueScriptedSession(
    createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
  )
  const site = solidBlastSiteOn(planetIndex)
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setChargesIntent(carried, FULL_RACK_SLOT_LEVEL, size))
  session.submit(0, poseOnTile(site.stand))
  return { session, ...site, params }
}

/** Plants a charge of `size` from the stand tile; answers the plant's events. */
export function plantSized(
  session: ScriptedSession,
  site: BlastSite,
  size: number,
  tick: number,
): DomainEvent[] {
  session.submit(tick, poseOnTile(site.stand))
  return session.submit(tick, { type: 'plantCharge', payload: { size } })
}

const FULL_RACK_SLOT_LEVEL = 5
/** Deep enough to be under the surface's air and caves of any planet the specs use. */
const SITE_DEPTH_TILES = 40

/** A solid stand tile with a solid wall east of it, in band-1 rock of planet `planetIndex`. */
export function solidBlastSiteOn(planetIndex: number): BlastSite {
  const params = planetParamsFor(WORLD_SEED, planetIndex)
  const ty = surfaceRowOfColumn(0, params.radiusTiles) - SITE_DEPTH_TILES
  for (let tx = -60; tx <= 60; tx++) {
    const stand = { tx, ty }
    const wall = { tx: tx + 1, ty }
    if (
      isSolidCell(cellAt(EMPTY_WORLD, params, stand)) &&
      isSolidCell(cellAt(EMPTY_WORLD, params, wall))
    ) {
      return { stand, wall }
    }
  }
  throw new Error(`no solid blast site on planet ${params.planetIndex}`)
}
