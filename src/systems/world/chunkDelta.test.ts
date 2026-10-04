import { describe, expect, it } from 'vitest'
import { toCanonicalJson } from '../authority/canonicalJson'
import {
  EMPTY_CHUNK_DELTA,
  applyChunkDelta,
  isCellRemoved,
  isChunkTouched,
  withCellOverride,
  withCellRemoved,
} from './chunkDelta'
import { chunkDigest } from './chunkDigest'
import { generateChunk } from './generateChunk'
import { planetParamsFor } from './planetParams'
import { CHUNK_CELLS } from './tileGrid'
import { AIR_CELL, GROUND_CELL, INDESTRUCTIBLE_CELL } from './worldCell'

const generated = generateChunk(planetParamsFor(83921, 1), 2, 5)

describe('chunk delta', () => {
  it('leaves the generated cells unchanged when empty', () => {
    expect(applyChunkDelta(generated, EMPTY_CHUNK_DELTA)).toEqual(generated)
    expect(isChunkTouched(EMPTY_CHUNK_DELTA)).toBe(false)
  })

  it('turns a removed tile into air and marks the chunk touched', () => {
    const delta = withCellRemoved(EMPTY_CHUNK_DELTA, 1023)
    expect(applyChunkDelta(generated, delta)[1023]).toBe(AIR_CELL)
    expect(isCellRemoved(delta, 1023)).toBe(true)
    expect(isChunkTouched(delta)).toBe(true)
  })

  it('never changes the delta it was given', () => {
    withCellRemoved(EMPTY_CHUNK_DELTA, 40)
    withCellOverride(EMPTY_CHUNK_DELTA, 41, GROUND_CELL)
    expect(isChunkTouched(EMPTY_CHUNK_DELTA)).toBe(false)
  })

  it('lets an override replace a removed tile and a removal drop an override', () => {
    const overridden = withCellOverride(
      withCellRemoved(EMPTY_CHUNK_DELTA, 7),
      7,
      INDESTRUCTIBLE_CELL,
    )
    expect(applyChunkDelta(generated, overridden)[7]).toBe(INDESTRUCTIBLE_CELL)
    const removedAgain = withCellRemoved(overridden, 7)
    expect(applyChunkDelta(generated, removedAgain)[7]).toBe(AIR_CELL)
    expect(removedAgain.overrides).toEqual([])
  })

  it('keeps overrides sorted by index, so equal deltas have one canonical form', () => {
    const oneWay = withCellOverride(
      withCellOverride(EMPTY_CHUNK_DELTA, 9, GROUND_CELL),
      3,
      AIR_CELL,
    )
    const otherWay = withCellOverride(
      withCellOverride(EMPTY_CHUNK_DELTA, 3, AIR_CELL),
      9,
      GROUND_CELL,
    )
    expect(toCanonicalJson(oneWay)).toBe(toCanonicalJson(otherWay))
  })

  it('stays exact canonical JSON with every tile removed, its bitset 128 bytes of words', () => {
    let delta = EMPTY_CHUNK_DELTA
    for (let index = 0; index < CHUNK_CELLS; index++) delta = withCellRemoved(delta, index)
    expect(delta.removedRows).toHaveLength(32)
    expect(delta.removedRows.every((row) => row === 0xffffffff)).toBe(true)
    expect(() => toCanonicalJson(delta)).not.toThrow()
  })

  it('changes the chunk digest when a tile is removed', () => {
    const dug = applyChunkDelta(generated, withCellRemoved(EMPTY_CHUNK_DELTA, 500))
    expect(chunkDigest(dug)).not.toBe(chunkDigest(generated))
    expect(chunkDigest(generated)).toMatch(/^[0-9a-f]{16}$/)
  })
})
