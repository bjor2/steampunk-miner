import { describe, expect, it } from 'vitest'
import { CHUNK_REBUILD_MIN_FRAMES } from '../../constants/scene'
import type { ChunkBuildNeed } from './chunkBuilds'
import { chunkFrameWorkOf, type ChunkWork } from './chunkFrameWork'

function needAt(
  cx: number,
  cy: number,
  isVisible: boolean,
  isBuilt = false,
  builtFrame = 0,
): ChunkBuildNeed {
  return { key: `${cx},${cy}`, cx, cy, isVisible, isBuilt, builtFrame }
}

const NOTHING_GENERATED = () => false
const EVERYTHING_GENERATED = () => true

function describeWork(items: readonly ChunkWork<ChunkBuildNeed>[]): string[] {
  return items.map((item) =>
    item.kind === 'generate'
      ? `generate ${item.chunk.cx},${item.chunk.cy}`
      : `build ${item.need.key}`,
  )
}

describe('chunk frame work (ticket 336)', () => {
  it('generates the chunks a cold chunk halo reads before building its mesh', () => {
    const work = chunkFrameWorkOf([needAt(0, 0, true)], 10, 1, NOTHING_GENERATED)
    expect(describeWork(work.items)).toEqual([
      'generate 0,0',
      'generate 1,0',
      'generate 0,1',
      'generate 1,1',
      'build 0,0',
    ])
  })

  it('generates nothing the planet cache already holds', () => {
    const isGenerated = (cx: number) => cx === 0
    const work = chunkFrameWorkOf([needAt(0, 0, true)], 10, 1, isGenerated)
    expect(describeWork(work.items)).toEqual(['generate 1,0', 'generate 1,1', 'build 0,0'])
  })

  it('generates first, then builds the chunks in view, then those on the drive line', () => {
    const needs = [needAt(5, 5, false), needAt(0, 0, true)]
    const isGenerated = (cx: number, cy: number) => !(cx === 6 && cy === 6) && cx !== 1
    const work = chunkFrameWorkOf(needs, 10, 2, isGenerated)
    expect(describeWork(work.items)).toEqual([
      'generate 1,0',
      'generate 1,1',
      'generate 6,6',
      'build 0,0',
      'build 5,5',
    ])
  })

  it('generates a chunk two halos share once', () => {
    const needs = [needAt(0, 0, true), needAt(1, 0, true)]
    const work = chunkFrameWorkOf(needs, 10, 2, NOTHING_GENERATED)
    const generated = describeWork(work.items).filter((line) => line.startsWith('generate'))
    expect(generated).toEqual([
      'generate 0,0',
      'generate 1,0',
      'generate 0,1',
      'generate 1,1',
      'generate 2,0',
      'generate 2,1',
    ])
  })

  it('plans at most the frame builds and says when needs are left over', () => {
    const needs = [needAt(0, 0, true), needAt(1, 0, true), needAt(2, 0, false)]
    const one = chunkFrameWorkOf(needs, 10, 1, EVERYTHING_GENERATED)
    const four = chunkFrameWorkOf(needs, 10, 4, EVERYTHING_GENERATED)
    expect(describeWork(one.items)).toEqual(['build 0,0'])
    expect(one.isEveryNeedPlanned).toBe(false)
    expect(describeWork(four.items)).toEqual(['build 0,0', 'build 1,0', 'build 2,0'])
    expect(four.isEveryNeedPlanned).toBe(true)
  })

  it('still rebuilds a stale chunk at most once in 4 frames', () => {
    const stale = needAt(0, 0, true, true, 10)
    const early = chunkFrameWorkOf(
      [stale],
      10 + CHUNK_REBUILD_MIN_FRAMES - 1,
      4,
      EVERYTHING_GENERATED,
    )
    const due = chunkFrameWorkOf([stale], 10 + CHUNK_REBUILD_MIN_FRAMES, 4, EVERYTHING_GENERATED)
    expect(early.items).toEqual([])
    expect(describeWork(due.items)).toEqual(['build 0,0'])
  })
})
