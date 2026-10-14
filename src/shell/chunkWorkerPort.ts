/**
 * The renderer's way to the chunk worker (TD scope c2 on #316, ticket 337): starts it, posts its
 * jobs and queues what it answers until the frame reads it. Null where no worker can run: under
 * node (specs, bench and bot scripts) and on the dev server, whose CSS-module imports inject
 * styles into a `document` a worker lacks; those build chunk meshes on the main thread instead.
 * Vite bundles the worker from its `new URL`, for the preview build and Electron's `file://` alike.
 */
import type {
  ChunkMeshJob,
  ChunkMeshResult,
  ChunkWorkerReply,
} from '../systems/render/chunkMeshJob'

export interface ChunkWorkerPort {
  post(job: ChunkMeshJob): void
  /** The oldest result not read yet, or null. */
  nextResult(): ChunkMeshResult | null
  /** It has loaded its slices and answers jobs. */
  isReady(): boolean
  /** It failed to start or threw: no job posted to it will come back. */
  hasFailed(): boolean
  terminate(): void
}

export function startChunkWorker(): ChunkWorkerPort | null {
  if (typeof Worker === 'undefined' || import.meta.env.DEV) return null
  return portOf(new Worker(new URL('../chunkWorker.ts', import.meta.url), { type: 'module' }))
}

interface PortState {
  results: ChunkMeshResult[]
  isReady: boolean
  hasFailed: boolean
}

function portOf(worker: Worker): ChunkWorkerPort {
  const state: PortState = { results: [], isReady: false, hasFailed: false }
  worker.onmessage = (event: MessageEvent<ChunkWorkerReply>) => takeReply(state, event.data)
  worker.onerror = (event) => failWorker(state, event.message)
  worker.onmessageerror = () => failWorker(state, 'a reply could not be read')
  return {
    post: (job) => worker.postMessage(job),
    nextResult: () => state.results.shift() ?? null,
    isReady: () => state.isReady && !state.hasFailed,
    hasFailed: () => state.hasFailed,
    terminate: () => worker.terminate(),
  }
}

function takeReply(state: PortState, reply: ChunkWorkerReply): void {
  if (reply.kind === 'ready') state.isReady = true
  else state.results.push(reply)
}

function failWorker(state: PortState, reason: string): void {
  if (!state.hasFailed) console.error(`chunk worker failed, meshing on the main thread: ${reason}`)
  state.hasFailed = true
}
