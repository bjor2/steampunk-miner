import { describe, expect, it } from 'vitest'
import { CHUNK_REBUILD_MIN_FRAMES, CHUNK_WORKER_JOBS_MAX } from '../../constants/scene'
import { EMPTY_CHUNK_DELTA, type ChunkDelta } from '../world/chunkDelta'
import {
  bookJob,
  createChunkJobBook,
  forgetJobs,
  isBookIdle,
  isJobDue,
  roomForJobs,
  takeFreshResult,
} from './chunkJobBook'
import type { ChunkViewVersion } from './chunkViewVersion'

// Chunk-worker coherence (TD scope c2 on #316, ticket 337): the main thread keeps each chunk's
// newest job and its view version, and drops results that a later job superseded.

/** A chunk's view after its own delta became `delta`. */
const viewWith = (delta: ChunkDelta | undefined): ChunkViewVersion => [
  delta,
  undefined,
  undefined,
  undefined,
]
const untouched = viewWith(undefined)
const edited = viewWith({ ...EMPTY_CHUNK_DELTA, version: 1 })
const KEY = '0,8'

describe('chunk job book (ticket 337)', () => {
  it('posts a job for a chunk with none out, and none again for the same view', () => {
    const book = createChunkJobBook()
    expect(isJobDue(book, { key: KEY, version: untouched }, 1)).toBe(true)
    bookJob(book, { key: KEY, version: untouched }, 1)
    expect(isJobDue(book, { key: KEY, version: untouched }, 50)).toBe(false)
  })

  it('posts an edited view while a job is out only once the rebuild cap has passed', () => {
    const book = createChunkJobBook()
    bookJob(book, { key: KEY, version: untouched }, 1)
    const need = { key: KEY, version: edited }
    expect(isJobDue(book, need, CHUNK_REBUILD_MIN_FRAMES)).toBe(false)
    expect(isJobDue(book, need, 1 + CHUNK_REBUILD_MIN_FRAMES)).toBe(true)
  })

  it('takes the newest job of a chunk as fresh, with the view it was built from', () => {
    const book = createChunkJobBook()
    const id = bookJob(book, { key: KEY, version: untouched }, 1)
    expect(takeFreshResult(book, KEY, id)).toEqual({ version: untouched, frame: 1 })
    expect(isBookIdle(book)).toBe(true)
  })

  it('drops the result of a job a later one superseded, then takes the later one', () => {
    const book = createChunkJobBook()
    const first = bookJob(book, { key: KEY, version: untouched }, 1)
    const second = bookJob(book, { key: KEY, version: edited }, 1 + CHUNK_REBUILD_MIN_FRAMES)
    expect(takeFreshResult(book, KEY, first)).toBeNull()
    expect(takeFreshResult(book, KEY, second)?.version).toBe(edited)
    expect(isBookIdle(book)).toBe(true)
  })

  it('drops every result out when the planet changes, still counting them down', () => {
    const book = createChunkJobBook()
    const id = bookJob(book, { key: KEY, version: untouched }, 1)
    forgetJobs(book)
    expect(isBookIdle(book)).toBe(false)
    expect(takeFreshResult(book, KEY, id)).toBeNull()
    expect(isBookIdle(book)).toBe(true)
  })

  it("never lets an old planet's result match a new planet's job of the same chunk", () => {
    const book = createChunkJobBook()
    const old = bookJob(book, { key: KEY, version: untouched }, 1)
    forgetJobs(book)
    const fresh = bookJob(book, { key: KEY, version: untouched }, 2)
    expect(takeFreshResult(book, KEY, old)).toBeNull()
    expect(takeFreshResult(book, KEY, fresh)?.version).toBe(untouched)
  })

  it('holds at most CHUNK_WORKER_JOBS_MAX jobs out at once', () => {
    const book = createChunkJobBook()
    for (let index = 0; index < CHUNK_WORKER_JOBS_MAX; index++)
      bookJob(book, { key: `${index},0`, version: untouched }, 1)
    expect(roomForJobs(book)).toBe(0)
  })
})
