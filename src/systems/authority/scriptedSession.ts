/**
 * A scripted authority session for specs (#11 section 5): intents applied at chosen ticks through
 * `applyCommand`, the clock moved with `advanceTicks`, every event kept, as a replay does. Plus the
 * planet-1 places the vehicle specs mine at. Pure, so it runs in node with no store.
 */
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { vehicleOf, createAuthorityState, type AuthorityState } from './authorityState'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor, type PlanetParams } from '../world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import { advanceTicks } from './advanceTicks'
import { applyCommand, type CommandOutcome } from './applyCommand'
import type { CommandIntent } from './authorityCommand'
import type { DomainEvent } from './domainEvent'

export const WORLD_SEED = 83921
export const PARAMS = planetParamsFor(WORLD_SEED, 1)
export const SITE = dockSiteOf(PARAMS)

export type ScriptedSession = ReturnType<typeof createScriptedSession>

export function createScriptedSession(playerIds: readonly string[] = ['p1']) {
  let outcome: CommandOutcome = {
    state: createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds }),
    events: [],
  }
  const seqs = new Map<string, number>()
  const keep = (step: CommandOutcome) => {
    outcome = { state: step.state, events: [...outcome.events, ...step.events] }
    return step.events
  }
  const nextSeq = (playerId: string) => {
    seqs.set(playerId, (seqs.get(playerId) ?? 0) + 1)
    return seqs.get(playerId) as number
  }
  return {
    submit: (tick: number, intent: CommandIntent, playerId = 'p1') =>
      keep(applyCommand(outcome.state, { playerId, tick, seq: nextSeq(playerId), ...intent })),
    advanceTo: (tick: number) => keep(advanceTicks(outcome.state, tick)),
    state: (): AuthorityState => outcome.state,
    vehicle: (playerId = 'p1') => vehicleOf(outcome.state, playerId),
    events: (): DomainEvent[] => outcome.events,
  }
}

export const typesOf = (events: readonly DomainEvent[]) => events.map((event) => event.type)

/** A band-1 ground tile on the surface, away from the pad and the starter vein. */
export const GROUND: TilePoint = { tx: 20, ty: surfaceRowOfColumn(20, PARAMS.radiusTiles) }

export interface ActionTicks {
  thrustTicks: number
  driveTicks: number
  drillTicks: number
}

/** The centre of a tile in mm, upright at the planet's top (the slice's surface), as a pose. */
export function poseAbove(tile: TilePoint, facing: Facing, counts: Partial<ActionTicks> = {}) {
  return {
    type: 'reportPose' as const,
    payload: {
      x: tile.tx * 1000 + 500,
      y: (tile.ty + 1) * 1000 + 500,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing,
      driving: false,
      thrusting: false,
      drilling: (counts.drillTicks ?? 0) > 0,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks: 0,
      ...counts,
    },
  }
}

/**
 * Specs about mining deep down, where crawlers live (#9), freeze enemies first so they see only
 * the drill: frozen enemies never spawn.
 */
export const FREEZE_ENEMIES = { type: 'debug.freezeEnemies', payload: { frozen: true } } as const

export const drill = (tile: TilePoint, ticks: number) =>
  ({ type: 'drillTile', payload: { ...tile, ticks } }) as const

/** Ore tiles near the surface, found in the generated planet (band 1 is 10% ore, #6). */
export function surfaceOreTiles(count: number, params: PlanetParams = PARAMS): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let tx = 12; tiles.length < count; tx++) {
    for (let depth = 0; depth < 6 && tiles.length < count; depth++) {
      const tile = { tx, ty: surfaceRowOfColumn(tx, params.radiusTiles) - depth }
      if (kindOfCell(cellAt(EMPTY_WORLD, params, tile)) === CELL_KIND.ore) tiles.push(tile)
    }
  }
  return tiles
}

/** Core tiles of the planet's centre disc (#10), nearest the top first. */
export function coreTiles(count: number, params: PlanetParams = PARAMS): TilePoint[] {
  const tiles: TilePoint[] = []
  const reach = params.coreRadiusTiles
  for (let ty = reach; ty >= -reach && tiles.length < count; ty--) {
    for (let tx = -reach; tx <= reach && tiles.length < count; tx++) {
      const tile = { tx, ty }
      if (kindOfCell(cellAt(EMPTY_WORLD, params, tile)) === CELL_KIND.core) tiles.push(tile)
    }
  }
  return tiles
}

/** Places the vehicle on a tile and drills it until it breaks, one command per tile. */
export function mineTile(
  session: ScriptedSession,
  tick: number,
  tile: TilePoint,
  playerId = 'p1',
): DomainEvent[] {
  session.submit(tick, poseAbove(tile, FACING.down), playerId)
  return session.submit(tick + 40, drill(tile, 40), playerId)
}
