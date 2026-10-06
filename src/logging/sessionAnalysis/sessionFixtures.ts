/**
 * Spec fixtures for the session analysis (#125): run-log lines in the envelope the game writes,
 * turned into the session folders the collector would hand over. Used by the specs only.
 */
import type { RunEventData, RunEventName } from '../eventNames'
import { formatNdjsonLine } from '../ndjson'
import { LOG_SCHEMA_VERSION, type RunEvent } from '../runEvent'
import { sessionTableOf, type SessionFiles, type SessionLog } from './sessionTable'

export interface LinePlace {
  tick: number
  planet?: number
  depthTiles?: number
}

export function runEventLine<N extends RunEventName>(
  runId: string,
  seq: number,
  place: LinePlace,
  event: N,
  data: RunEventData<N>,
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq,
    tick: place.tick,
    timestamp: place.tick / 60,
    runId,
    playerId: 'p1',
    planet: place.planet ?? 1,
    depthTiles: place.depthTiles ?? 0,
    event,
    data,
  } as RunEvent
}

export function sessionFilesOf(
  folder: string,
  events: readonly object[],
  metadata: object | null = null,
): SessionFiles {
  return {
    folder,
    eventsText: events.map(formatNdjsonLine).join(''),
    metadataText: metadata === null ? null : JSON.stringify(metadata),
  }
}

/** One readable session from its lines; throws when the table refuses it. */
export function sessionOf(events: readonly RunEvent[], folder = 'logs/run'): SessionLog {
  const table = sessionTableOf([sessionFilesOf(folder, events)])
  if (table.sessions.length !== 1) throw new Error(JSON.stringify(table.refused))
  return table.sessions[0]
}

export interface MemoryFields {
  elapsedS: number
  heapKB: number
  minerals?: number
  chunksCached?: number
  geometries?: number
  textures?: number
  colliders?: number
}

export function memorySampleData(fields: MemoryFields): RunEventData<'memory_sample'> {
  return {
    elapsedS: fields.elapsedS,
    jsHeapUsedKB: fields.heapKB,
    jsHeapTotalKB: fields.heapKB * 2,
    jsHeapLimitKB: 4_000_000,
    wasmKB: 1280,
    geometries: fields.geometries ?? 30,
    textures: fields.textures ?? 17,
    programs: 9,
    rigidBodies: 1,
    colliders: fields.colliders ?? 7,
    chunksCached: fields.chunksCached ?? 12,
    chunksMeshed: 4,
    domNodes: 88,
    listeners: 190,
    maxDepthTiles: 0,
    tilesDestroyed: 0,
    mineralsCollected: fields.minerals ?? 0,
    moneyTotal: '0e+0',
  }
}

export function perfSampleData(
  frameMsP95: number,
  longTasks = 0,
  frameMsP99 = frameMsP95,
): RunEventData<'perf_sample'> {
  return {
    frameMsP50: frameMsP95 / 2,
    frameMsP95,
    frameMsP99,
    longTasks,
    terrainMsP95: 1,
    renderScale: 1,
    colliders: 7,
    drawCalls: 40,
    triangles: 9000,
    groundBlocks: 300,
    chunksLoaded: 4,
  }
}

export function collectedData(
  oreId: string,
  oreDepthTiles: number,
  chunk: string,
): RunEventData<'resource_collected'> {
  return { resourceTier: 1, amount: 1, value: '4e+0', oreId, oreDepthTiles, chunk }
}

export function benchmarkData(
  name: string,
  medianUs: number,
  commit: string,
): RunEventData<'benchmark_result'> {
  return { name, medianUs, p95Us: medianUs * 2, runs: 30, commit }
}
