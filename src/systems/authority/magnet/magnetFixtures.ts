/**
 * Fixtures for the magnet shift specs (ticket 283): a fake slice that hollows tiles into cave air
 * and uses a magnet through `shiftCellsByMagnet`, and the planet-1 walls the specs push. Only specs
 * use it; no real slice is imported, so the specs see the kernel rule alone.
 *
 * Hollowing is two K6 edits on two ticks, the swap to air first: air is not removable, so opening
 * it afterwards leaves the tile unyielded, the open air of a generated cave.
 */
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { replayRun } from '../../replay/replayRun'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import { ticksPerTile } from '../../vehicle/drillRule'
import { bandOfTile } from '../../world/planetGeometry'
import type { PlanetParams } from '../../world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../world/tileGrid'
import { AIR_CELL, CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import { createAuthorityState, vehicleOf, type AuthorityState } from '../authorityState'
import type { AuthorityCommand, CommandIntent } from '../authorityCommand'
import type { CommandRule } from '../commandRule'
import { hardnessOfTile } from '../groundDrill'
import { PARAMS, surfaceOreTiles, WORLD_SEED } from '../scriptedSession'
import { queueTerrainEdit } from '../terrain/terrainEdits'
import { shiftCellsByMagnet, type MagnetPush, type MagnetShiftRequest } from './shiftCellsByMagnet'

declare module '../authorityCommand' {
  interface CommandPayloads {
    'magnet-probe.hollowToAir': Record<string, never>
    'magnet-probe.open': Record<string, never>
    'magnet-probe.push': Record<string, never>
  }
}

/** The fake item's `source`: what asks `canMine` and names the queued edits. */
export const MAGNET_SOURCE = 'magnet-probe.repulsor'

/** A wall cell and the touching tile the specs hollow into cave air for it. */
export interface WallAndCave {
  wall: TilePoint
  cave: TilePoint
}

/** What the fake slice does: the tiles it hollows, and the use it makes. */
export interface MagnetProbe {
  caves: readonly TilePoint[]
  pushes: readonly MagnetPush[]
  askedQuantaPerCell?: number
}

export function magnetProbeSlice(probe: MagnetProbe): SliceDefinition {
  const request = (playerId: string): MagnetShiftRequest => ({
    playerId,
    source: MAGNET_SOURCE,
    pushes: probe.pushes,
    askedQuantaPerCell: probe.askedQuantaPerCell ?? 0,
  })
  const hollowToAir: CommandRule<'magnet-probe.hollowToAir'> = {
    fields: {},
    apply: (state, { playerId }) => ({
      state: queueTerrainEdit(state, {
        playerId,
        source: 'magnet-probe.hollow',
        cells: probe.caves.map((tile) => ({ kind: 'swap', ...tile, cell: AIR_CELL })),
      }),
      events: [],
    }),
  }
  const open: CommandRule<'magnet-probe.open'> = {
    fields: {},
    apply: (state, { playerId }) => ({
      state: queueTerrainEdit(state, {
        playerId,
        source: 'magnet-probe.hollow',
        cells: probe.caves.map((tile) => ({ kind: 'density', ...tile, density: 0 })),
      }),
      events: [],
    }),
  }
  const push: CommandRule<'magnet-probe.push'> = {
    fields: {},
    apply: (state, { playerId }) => ({
      state: shiftCellsByMagnet(state, request(playerId)).state,
      events: [],
    }),
  }
  return {
    id: 'magnet-probe',
    register: (r) =>
      r.commandRules({
        'magnet-probe.hollowToAir': hollowToAir,
        'magnet-probe.open': open,
        'magnet-probe.push': push,
      }),
  }
}

/** The tick the magnet is used at, once the caves stand open. */
export const PUSH_TICK = 10
/** Late enough for every queued move to land, at two chunks a tick. */
export const SETTLED_TICK = 40

/** Hollow the caves, then use the magnet on a full tank: one run's commands for `replayRun`. */
export function hollowThenPushCommands(): AuthorityCommand[] {
  const intents: [number, CommandIntent][] = [
    [1, { type: 'magnet-probe.hollowToAir', payload: {} }],
    [4, { type: 'magnet-probe.open', payload: {} }],
    [PUSH_TICK, { type: 'magnet-probe.push', payload: {} }],
  ]
  return intents.map(([tick, intent], index) => ({
    playerId: 'p1',
    tick,
    seq: index + 1,
    ...intent,
  }))
}

export interface MagnetRunOptions {
  /** Render frames a second the clock runs in; absent, it jumps to each command. */
  rate?: number
  /** Commands before the fixture's own, all at tick 0 (a planet, upgrades). */
  lead?: readonly AuthorityCommand[]
  /** The run's last tick; the moves have settled by default. */
  endTick?: number
}

/** Replays the hollow-then-push run with `slices` registered, and answers the state it ends in. */
export function playMagnetRun(
  slices: readonly SliceDefinition[],
  { rate, lead = [], endTick = SETTLED_TICK }: MagnetRunOptions = {},
): AuthorityState {
  const commands = [...lead, ...hollowThenPushCommands()].map((command, index) => ({
    ...command,
    seq: index + 1,
  }))
  return withRegistrations(slices, () =>
    replayRun(WORLD_SEED, commands, { endTick, framesPerSecond: rate }),
  ).state
}

/** The caves of `pairs` hollowed, and each wall pushed into its own. */
export function probeOf(pairs: readonly WallAndCave[], askedQuantaPerCell = 0): MagnetProbe {
  return { caves: cavesOf(pairs), pushes: pushesInto(pairs), askedQuantaPerCell }
}

/** Each wall pushed into its own cave, and nowhere else. */
export function pushesInto(pairs: readonly WallAndCave[]): MagnetPush[] {
  return pairs.map(({ wall, cave }) => ({ from: wall, to: [cave] }))
}

export function cavesOf(pairs: readonly WallAndCave[]): TilePoint[] {
  return pairs.map(({ cave }) => cave)
}

/**
 * Band-1 ground walls the starting drill digs, a few tiles down, each with the plain ground tile
 * under it to hollow; three columns apart, so no wall touches another wall's cave.
 */
export function groundWalls(count: number, params: PlanetParams = PARAMS): WallAndCave[] {
  const pairs: WallAndCave[] = []
  for (let tx = 14; pairs.length < count; tx += 3) {
    const wall = { tx, ty: surfaceRowOfColumn(tx, params.radiusTiles) - 4 }
    const cave = { tx, ty: wall.ty - 1 }
    if (isGroundPair(params, wall, cave)) pairs.push({ wall, cave })
  }
  return pairs
}

/** Planet-1 ore cells near the surface, each with a touching ground tile in its band to hollow. */
export function oreWalls(count: number): WallAndCave[] {
  const pairs: WallAndCave[] = []
  const used = new Set<string>()
  for (const wall of surfaceOreTiles(count * 4)) {
    const cave = groundTouching(PARAMS, wall, used)
    if (cave === null || pairs.length === count) continue
    used.add(keyOf(wall)).add(keyOf(cave))
    pairs.push({ wall, cave })
  }
  return pairs
}

/** Whether the vehicle's drill in `state` could dig `tile` on `params`' planet as generated. */
export function isDiggableBy(
  state: AuthorityState,
  params: PlanetParams,
  tile: TilePoint,
): boolean {
  const drill = statsOfVehicle(vehicleOf(state, 'p1'))
  const cell = cellAt(EMPTY_WORLD, params, tile)
  return ticksPerTile(drill, hardnessOfTile(params, tile, cell)) !== null
}

/** Whether the starting vehicle's drill could dig `tile` on `params`' planet. */
export function isDiggableByStartingDrill(params: PlanetParams, tile: TilePoint): boolean {
  const start = createAuthorityState({
    planetIndex: params.planetIndex,
    planetSeed: WORLD_SEED,
    playerIds: ['p1'],
  })
  return isDiggableBy(start, params, tile)
}

/**
 * A band-1 ground wall whose only open cell would be the ground tile under it, across the band-2
 * edge: a move there would change the cell's band.
 */
export function bandEdgeWall(params: PlanetParams = PARAMS): WallAndCave {
  for (let tx = 40; tx < 80; tx += 3) {
    for (let ty = surfaceRowOfColumn(tx, params.radiusTiles); ty > 0; ty--) {
      const wall = { tx, ty }
      const cave = { tx, ty: ty - 1 }
      if (bandOfTile(params, tx, ty) === bandOfTile(params, tx, ty - 1)) continue
      if (isGround(params, wall) && isGround(params, cave)) return { wall, cave }
      break
    }
  }
  throw new Error('no ground wall on a band edge found')
}

function isGroundPair(params: PlanetParams, wall: TilePoint, cave: TilePoint): boolean {
  return (
    isGround(params, wall) &&
    isGround(params, cave) &&
    bandOfTile(params, wall.tx, wall.ty) === bandOfTile(params, cave.tx, cave.ty)
  )
}

function groundTouching(
  params: PlanetParams,
  wall: TilePoint,
  used: ReadonlySet<string>,
): TilePoint | null {
  const band = bandOfTile(params, wall.tx, wall.ty)
  for (const [dx, dy] of [
    [0, -1],
    [-1, 0],
    [1, 0],
  ]) {
    const tile = { tx: wall.tx + dx, ty: wall.ty + dy }
    const isFree = !used.has(keyOf(tile)) && !touchesAny(tile, used)
    if (isFree && isGround(params, tile) && bandOfTile(params, tile.tx, tile.ty) === band) {
      return tile
    }
  }
  return null
}

function touchesAny(tile: TilePoint, used: ReadonlySet<string>): boolean {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++)
      if (used.has(keyOf({ tx: tile.tx + dx, ty: tile.ty + dy }))) return true
  }
  return false
}

function isGround(params: PlanetParams, tile: TilePoint): boolean {
  return kindOfCell(cellAt(EMPTY_WORLD, params, tile)) === CELL_KIND.ground
}

function keyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}
