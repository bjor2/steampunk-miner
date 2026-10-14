/**
 * The terrain's chunk streaming through the chunk worker (TD scope c2 on #316, ticket 337): the
 * worker generates each chunk and builds its mesh parts, so the main thread only reads the
 * results back and turns them into three objects, under the 2 ms of #4, then posts the jobs the
 * frame's needs are due. `chunkJobBook` decides which results are fresh; a stale one is dropped,
 * and so is one for a chunk the view no longer keeps (the pool's sink). Until the worker is ready, and for good once
 * it fails, the pool builds on the main thread as before (`chunkStreamFrame.ts`).
 */
import { TERRAIN_FRAME_BUDGET_MS } from '../constants/scene'
import type { ChunkWorkerPort } from '../shell/chunkWorkerPort'
import { spendFrameBudgetOn } from '../systems/render/chunkBuildBudget'
import { chunksToBuild } from '../systems/render/chunkBuilds'
import {
  bookJob,
  createChunkJobBook,
  forgetJobs,
  isBookIdle,
  isJobDue,
  roomForJobs,
  takeFreshResult,
  type ChunkJobBook,
  type JobView,
} from '../systems/render/chunkJobBook'
import { chunkMeshJobOf, type ChunkMeshResult } from '../systems/render/chunkMeshJob'
import type { ChunkMeshParts } from '../systems/render/chunkMeshParts'
import { chunkKey } from '../systems/world/tileGrid'
import type { WorldState } from '../systems/world/worldState'
import type { ChunkNeed } from './chunkBuildNeeds'
import { timedMs, type StreamView } from './chunkStreamFrame'

/** The worker and the book of the jobs posted to it. */
export interface ChunkJobs {
  port: ChunkWorkerPort
  book: ChunkJobBook
}

/** What a frame of job streaming reads of the terrain's view. */
export interface JobStreamView extends StreamView {
  world: WorldState
}

/**
 * Where fresh mesh parts go: the pool, which meshes them if it still keeps the chunk. `view` is the
 * version they show and the frame that read it, which the rebuild cap counts from.
 */
export type MeshPartsSink = (key: string, view: JobView, parts: ChunkMeshParts) => void

export function chunkJobsOf(port: ChunkWorkerPort): ChunkJobs {
  return { port, book: createChunkJobBook() }
}

/** Whether the worker builds this frame's meshes: it is up and has not failed. */
export function isWorkerMeshing(jobs: ChunkJobs | null): jobs is ChunkJobs {
  return jobs !== null && jobs.port.isReady()
}

/** Hands the results waiting to `sink` while the frame's budget lasts; stale ones are dropped. */
export function readChunkResults(jobs: ChunkJobs, sink: MeshPartsSink): void {
  const runTimed = (result: ChunkMeshResult) => timedMs(() => installIfFresh(jobs, sink, result))
  spendFrameBudgetOn(() => jobs.port.nextResult(), runTimed, TERRAIN_FRAME_BUDGET_MS)
}

/**
 * Posts the needs whose job is due, in build order, as many as the worker has room for: posting
 * costs the main thread little, so the worker's own pace bounds the stream, not c1's builds a
 * frame, and the room keeps a chunk coming into view near the front of its queue.
 */
export function postChunkJobs(
  jobs: ChunkJobs,
  needs: readonly ChunkNeed[],
  frame: number,
  view: JobStreamView,
): void {
  const due = needs.filter((need) => isJobDue(jobs.book, need, frame))
  for (const need of chunksToBuild(due, frame, roomForJobs(jobs.book)))
    postJob(jobs, need, frame, view)
}

/** Nothing is left to post and no result is still to come. */
export function isJobStreamDone(jobs: ChunkJobs, needs: readonly ChunkNeed[]): boolean {
  return needs.length === 0 && isBookIdle(jobs.book)
}

/** Every job out now answers stale (the planet changed); their results are still read and dropped. */
export function forgetChunkJobs(jobs: ChunkJobs | null): void {
  if (jobs !== null) forgetJobs(jobs.book)
}

function postJob(jobs: ChunkJobs, need: ChunkNeed, frame: number, view: JobStreamView): void {
  const id = bookJob(jobs.book, need, frame)
  jobs.port.post(chunkMeshJobOf(id, view.params, view.world, need.cx, need.cy))
}

function installIfFresh(jobs: ChunkJobs, sink: MeshPartsSink, result: ChunkMeshResult): void {
  const key = chunkKey(result.cx, result.cy)
  const view = takeFreshResult(jobs.book, key, result.id)
  if (view !== null) sink(key, view, result.parts)
}
