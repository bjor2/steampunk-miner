import { describe, expect, it } from 'vitest'
import { CHUNK_REBUILD_MIN_FRAMES, VIEW_HALF_DIAGONAL_MAX_M } from '../constants/scene'
import type { ChunkWorkerPort } from '../shell/chunkWorkerPort'
import {
  runChunkMeshJob,
  type ChunkMeshJob,
  type ChunkMeshResult,
} from '../systems/render/chunkMeshJob'
import { buildChunkMeshParts, type ChunkMeshParts } from '../systems/render/chunkMeshParts'
import type { JobView } from '../systems/render/chunkJobBook'
import { clearDisc } from '../systems/world/groundEdit'
import { planetParamsFor } from '../systems/world/planetParams'
import { CHUNK_SIZE } from '../systems/world/tileGrid'
import { EMPTY_WORLD, type WorldState } from '../systems/world/worldState'
import { chunkNeedsOf } from './chunkBuildNeeds'
import {
  chunkJobsOf,
  forgetChunkJobs,
  isJobStreamDone,
  postChunkJobs,
  readChunkResults,
  type ChunkJobs,
} from './chunkJobStream'

// Streaming through the chunk worker (TD scope c2 on #316, ticket 337), with the worker's job run
// in-process behind a structured clone each way: the main thread keeps the chunk's version and
// discards stale results.

const params = planetParamsFor(83921, 1)
/** Chunk (0, 8) of planet 1, under the surface, in view and with no mesh yet. */
const SHOWN = { cx: 0, cy: 8, blockMask: 0xffff }
const KEY = '0,8'

interface InstalledParts {
  key: string
  view: JobView
  parts: ChunkMeshParts
}

/** A worker that answers its jobs, oldest first, only when told to. */
function createInProcessWorker() {
  const posted: ChunkMeshJob[] = []
  const results: ChunkMeshResult[] = []
  const port: ChunkWorkerPort = {
    post: (job) => posted.push(structuredClone(job)),
    nextResult: () => results.shift() ?? null,
    isReady: () => true,
    hasFailed: () => false,
    terminate: () => undefined,
  }
  const answerPosted = () => {
    for (const job of posted.splice(0)) results.push(structuredClone(runChunkMeshJob(job)))
  }
  return { port, posted, answerPosted }
}

function holeIn(world: WorldState): WorldState {
  const disc = {
    xMm: 16_000,
    yMm: SHOWN.cy * CHUNK_SIZE * 1000 + 16_000,
    radiusMm: 950,
    floorRadiusMm: null,
  }
  return clearDisc(world, params, disc, 255).world
}

function streamFrame(
  jobs: ChunkJobs,
  world: WorldState,
  frame: number,
  installed: InstalledParts[],
) {
  readChunkResults(jobs, (key, view, parts) => installed.push({ key, view, parts }))
  const needs = chunkNeedsOf({ meshes: new Map(), visible: [SHOWN], ahead: [] }, { params, world })
  postChunkJobs(jobs, needs, frame, {
    params,
    world,
    viewRadius: VIEW_HALF_DIAGONAL_MAX_M,
    velocity: { x: 0, y: 0 },
  })
}

describe('chunk job stream (ticket 337)', () => {
  it('renders the edited version of a chunk edited while its job was in flight', () => {
    const worker = createInProcessWorker()
    const jobs = chunkJobsOf(worker.port)
    const installed: InstalledParts[] = []
    streamFrame(jobs, EMPTY_WORLD, 1, installed)
    const edited = holeIn(EMPTY_WORLD)
    for (let frame = 2; frame <= 1 + CHUNK_REBUILD_MIN_FRAMES; frame++)
      streamFrame(jobs, edited, frame, installed)
    expect(worker.posted).toHaveLength(2)
    worker.answerPosted()
    streamFrame(jobs, edited, 2 + CHUNK_REBUILD_MIN_FRAMES, installed)
    expect(installed).toHaveLength(1)
    expect(installed[0].view.version[0]).toBe(edited.chunks[KEY])
    expect(installed[0].parts).toEqual(buildChunkMeshParts(params, edited, SHOWN.cx, SHOWN.cy))
  })

  it("keeps the newest job's mesh when the world moved on, and asks for the edited view next", () => {
    const worker = createInProcessWorker()
    const jobs = chunkJobsOf(worker.port)
    const installed: InstalledParts[] = []
    streamFrame(jobs, EMPTY_WORLD, 1, installed)
    worker.answerPosted()
    const edited = holeIn(EMPTY_WORLD)
    streamFrame(jobs, edited, 2, installed)
    expect(installed.map(({ view }) => view.version[0])).toEqual([undefined])
    expect(worker.posted.map((job) => Object.keys(job.deltas))).toEqual([[KEY]])
  })

  it('drops the results of a planet left behind and is done once they are read', () => {
    const worker = createInProcessWorker()
    const jobs = chunkJobsOf(worker.port)
    const installed: InstalledParts[] = []
    streamFrame(jobs, EMPTY_WORLD, 1, installed)
    forgetChunkJobs(jobs)
    worker.answerPosted()
    readChunkResults(jobs, (key, view, parts) => installed.push({ key, view, parts }))
    expect(installed).toEqual([])
    expect(isJobStreamDone(jobs, [])).toBe(true)
  })
})
