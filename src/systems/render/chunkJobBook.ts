/**
 * Which chunk-worker results the renderer keeps (TD scope c2 on #316, ticket 337: "the main thread
 * keeps the chunk version and discards stale results"). The main thread numbers every job and
 * keeps, per chunk, the newest one it posted with the view version it was built from; the worker
 * only ever sees plain deltas, never the versions.
 *
 * - A result is fresh only when it answers its chunk's newest job: a result some later job
 *   superseded (the chunk changed while it was in flight) is stale and dropped, so the mesh never
 *   steps back to a view older than one already asked for.
 * - A chunk with a job in flight gets another only once its view has changed again and
 *   `CHUNK_REBUILD_MIN_FRAMES` have passed since the last post. A chunk the drill cuts every tick
 *   then still gets a mesh every few frames, since its newest job's result is kept even though the
 *   world moved on while it was built; the need for the newer view stays, as for any stale mesh.
 * - At most `CHUNK_WORKER_JOBS_MAX` jobs are in the worker at once, so a chunk coming into view
 *   never queues behind a long line of chunks ahead.
 */
import { CHUNK_REBUILD_MIN_FRAMES, CHUNK_WORKER_JOBS_MAX } from '../../constants/scene'
import { isSameChunkView, type ChunkViewVersion } from './chunkViewVersion'

/** The view a job's mesh shows: its chunk's version and the frame the job read the world in. */
export interface JobView {
  version: ChunkViewVersion
  frame: number
}

interface PostedJob extends JobView {
  id: number
}

export interface ChunkJobBook {
  /** The newest job posted for each chunk whose result has not been read, by chunk key. */
  newest: Map<string, PostedJob>
  /** Jobs posted whose result, fresh or stale, has not been read yet. */
  inFlight: number
  /** The next job's number; it keeps counting across planets so no old result ever matches. */
  nextId: number
}

/** A chunk that wants a mesh of `version`. */
export interface ChunkJobNeed {
  key: string
  version: ChunkViewVersion
}

export function createChunkJobBook(): ChunkJobBook {
  return { newest: new Map(), inFlight: 0, nextId: 1 }
}

/** Whether a job for the need may be posted this frame, room in the worker aside. */
export function isJobDue(book: ChunkJobBook, need: ChunkJobNeed, frame: number): boolean {
  const posted = book.newest.get(need.key)
  if (posted === undefined) return true
  if (isSameChunkView(posted.version, need.version)) return false
  return frame - posted.frame >= CHUNK_REBUILD_MIN_FRAMES
}

/** Jobs the worker can take now. */
export function roomForJobs(book: ChunkJobBook): number {
  return Math.max(0, CHUNK_WORKER_JOBS_MAX - book.inFlight)
}

/** Books a job for the need, posted this frame, and answers its number. */
export function bookJob(book: ChunkJobBook, need: ChunkJobNeed, frame: number): number {
  const id = book.nextId++
  book.newest.set(need.key, { id, version: need.version, frame })
  book.inFlight++
  return id
}

/**
 * Reads a result back: the view it was built from when it answers its chunk's newest job, else
 * null, and the result is stale.
 */
export function takeFreshResult(book: ChunkJobBook, key: string, id: number): JobView | null {
  book.inFlight = Math.max(0, book.inFlight - 1)
  const posted = book.newest.get(key)
  if (posted === undefined || posted.id !== id) return null
  book.newest.delete(key)
  return { version: posted.version, frame: posted.frame }
}

/** Every job out now answers stale: the planet changed. Their results still count down. */
export function forgetJobs(book: ChunkJobBook): void {
  book.newest.clear()
}

/** Nothing is out: no result is still to come. */
export function isBookIdle(book: ChunkJobBook): boolean {
  return book.inFlight === 0
}
