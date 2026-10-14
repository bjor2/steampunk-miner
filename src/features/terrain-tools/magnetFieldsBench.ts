/**
 * The magnet fields' slice bench (GD and TD rulings on #286 Q1, the second measured raise of
 * #213's line): a rig descends P43 (endless Lodestone, magnetic, past P40) at the 16 m/s top
 * speed, 60 frames a second, with all three verbs live for three players: each re-plants a beacon
 * every second, fires a coil wave every half second and re-locks a full clamp (8 pinned cells,
 * 9 braced blocks) every 1.5 s round where the rig is now, so fields stream past. Each frame is
 * timed before (no layer) and after (the layer's frame work: the change watch, and a rebuild of
 * the buffer when a field changed), alternating so load drift lands on both. The clock is the
 * caller's (`npm run bench:render` passes `performance.now`), so nothing here reads time itself.
 * Reached through the debug action `timeMagnetFieldFrames`.
 */
import { MAX_SPEED_MM_PER_SECOND } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import { createAuthorityState, type AuthorityState } from '../../systems/authority/authorityState'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { continueScriptedSession } from '../../systems/authority/scriptedSession'
import type { MetrePoint } from '../../systems/render/gunLook'
import { planetParamsFor } from '../../systems/world/planetParams'
import type { TilePoint } from '../../systems/world/tileGrid'
import { clampBracesAt, LODE_CLAMP_ID } from './systems/lodeClamp'
import { LODESTONE_BEACON_ID } from './systems/lodestoneBeacon'
import { REPULSOR_COIL_ID } from './systems/repulsorCoil'
import { withBeacon, withClampField } from './systems/terrainSection'
import {
  coilRadiusAt,
  createHeardMagnetFields,
  MAX_HEARD_FIELDS,
  type HeardMagnetFields,
} from './systems/render/heardMagnetFields'
import { createMagnetFieldBuffer, type MagnetFieldBuffer } from './systems/render/magnetFieldBuffer'
import { MAGNET_FIELD_LOOK } from './systems/render/magnetFieldLook'
import { createMagnetFieldWatch, refreshMagnetFields } from './systems/render/magnetFieldRefresh'

/** Endless Lodestone: magnetic, and past P40. */
export const MAGNET_FIELD_BENCH_PLANET = 43
const FPS = 60
const SECONDS = 30
const START_DEPTH_M = 4
const TOP_SPEED_M_PER_S = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE
const PLAYER_IDS = ['p1', 'p2', 'p3'] as const
/** The co-op players work this many metres either side of the local rig. */
const COOP_OFFSET_M = 6
const WAVE_EVERY_FRAMES = 30
const PLANT_EVERY_FRAMES = 60
const CLAMP_EVERY_FRAMES = 90
const CLAMP_HOLD_TICKS = 180

export interface MagnetFieldFrameTimes {
  planetIndex: number
  /** Each frame with no layer, ms. */
  before: number[]
  /** Each frame with the layer's work, ms. */
  after: number[]
  /** The frames that rebuilt the buffer, ms. */
  rebuilds: number[]
  /** Pieces written last. */
  pieces: number
  /** Times a vertex buffer was replaced: the ruling wants none. */
  bufferReallocations: number
}

/** A warm-up descent, then the timed one, on a fresh buffer each. */
export function timeMagnetFieldFrames(
  worldSeed: number,
  nowMs: () => number,
): MagnetFieldFrameTimes {
  descend(worldSeed, createMagnetFieldBuffer(), nowMs)
  const buffer = createMagnetFieldBuffer()
  const allocated = arraysOf(buffer)
  const times = descend(worldSeed, buffer, nowMs)
  return {
    planetIndex: MAGNET_FIELD_BENCH_PLANET,
    ...times,
    pieces: buffer.pieceCount,
    bufferReallocations: arraysOf(buffer).filter((array, at) => array !== allocated[at]).length,
  }
}

function arraysOf(buffer: MagnetFieldBuffer): Float32Array[] {
  return [buffer.positions, buffer.grow, buffer.timing, buffer.levels]
}

function descend(worldSeed: number, buffer: MagnetFieldBuffer, nowMs: () => number) {
  const times = { before: [] as number[], after: [] as number[], rebuilds: [] as number[] }
  const radiusTiles = planetParamsFor(worldSeed, MAGNET_FIELD_BENCH_PLANET).radiusTiles
  const heard = createHeardMagnetFields()
  const watch = createMagnetFieldWatch()
  let state = ownersOfEveryMagnet(worldSeed)
  for (let frame = 0; frame < FPS * SECONDS; frame++) {
    const view = { x: 0.5, y: radiusTiles - START_DEPTH_M - (TOP_SPEED_M_PER_S * frame) / FPS }
    state = fieldsChangedAt({ ...state, tick: frame }, heard, view, frame)
    times.before.push(timedMs(nowMs, () => false))
    const start = nowMs()
    const rebuilt = refreshMagnetFields(buffer, heard, watch, { state, localPlayerId: 'p1', view })
    times.after.push(nowMs() - start)
    if (rebuilt) times.rebuilds.push(times.after[times.after.length - 1])
  }
  return times
}

/** P43 with every bench player owning the beacon, the coil and the clamp. */
function ownersOfEveryMagnet(worldSeed: number): AuthorityState {
  const session = continueScriptedSession(
    createAuthorityState({
      planetIndex: MAGNET_FIELD_BENCH_PLANET,
      planetSeed: worldSeed,
      playerIds: PLAYER_IDS,
    }),
  )
  const slots = {
    'powerup.1': LODESTONE_BEACON_ID,
    'powerup.2': REPULSOR_COIL_ID,
    'powerup.3': LODE_CLAMP_ID,
  }
  PLAYER_IDS.forEach((playerId) => session.submit(0, setVehicleLoadoutCommand(slots), playerId))
  return session.state()
}

/** The frame's field changes for every player, each round its own place beside the rig. */
function fieldsChangedAt(
  state: AuthorityState,
  heard: HeardMagnetFields,
  view: MetrePoint,
  frame: number,
): AuthorityState {
  return PLAYER_IDS.reduce((current, playerId, at) => {
    const tile = { tx: Math.floor(view.x + (at - 1) * COOP_OFFSET_M), ty: Math.floor(view.y) }
    if (frame % WAVE_EVERY_FRAMES === 0) fireWave(heard, playerId, tile, frame)
    const planted = frame % PLANT_EVERY_FRAMES === 0 ? plant(current, playerId, tile) : current
    return frame % CLAMP_EVERY_FRAMES === 0 ? lockFullClamp(planted, playerId, tile) : planted
  }, state)
}

/** The wave as the layer hears it, at the coil's largest radius. */
function fireWave(heard: HeardMagnetFields, playerId: string, tile: TilePoint, tick: number) {
  const wave = {
    kind: 'repel' as const,
    playerId,
    centre: { x: tile.tx + 0.5, y: tile.ty + 0.5 },
    radiusM: coilRadiusAt(Number.MAX_SAFE_INTEGER),
    timing: {
      startTick: tick,
      growTicks: MAGNET_FIELD_LOOK.repel.growTicks,
      brightFromTick: tick,
      endTick: tick + MAGNET_FIELD_LOOK.repel.lingerTicks,
    },
  }
  heard.fields = [...heard.fields, wave].slice(-MAX_HEARD_FIELDS)
  heard.version += 1
}

function plant(state: AuthorityState, playerId: string, tile: TilePoint): AuthorityState {
  const beacon = {
    ...tile,
    planetIndex: MAGNET_FIELD_BENCH_PLANET,
    plantedTick: state.tick,
    mark: 0,
  }
  return withBeacon(state, playerId, beacon)
}

/** A clamp pinning 8 cells round the tile, every block they touch braced (ring 1, 9 blocks). */
function lockFullClamp(state: AuthorityState, playerId: string, tile: TilePoint): AuthorityState {
  const cells = Array.from({ length: 8 }, (_, at) => ({
    tx: tile.tx + (at % 3) - 1,
    ty: tile.ty + Math.floor(at / 3) - 1,
  }))
  const field = {
    cells,
    startTick: state.tick,
    finishTick: state.tick + CLAMP_HOLD_TICKS,
    energy: 0,
  }
  const clamped = withClampField(state, playerId, field)
  return { ...clamped, collapse: { blocks: bracedEntriesOf(clamped) } }
}

/** Every block a held field claims, warning and braced, as the collapse list would hold it. */
function bracedEntriesOf(state: AuthorityState) {
  return clampBracesAt(state).map(({ block }) => ({
    block,
    startTick: state.tick,
    isForced: false,
    isBraced: true as const,
  }))
}

function timedMs(nowMs: () => number, work: () => unknown): number {
  const start = nowMs()
  work()
  return nowMs() - start
}
