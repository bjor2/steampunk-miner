import { describe, expect, it } from 'vitest'
import { stateDigest } from '../authority/stateDigest'
import { chunkRepairOf, mismatchedChunks, touchedChunksOf, withChunkRepaired } from './chunkRepair'
import { carveDisc } from './groundEdit'
import { planetParamsFor } from './planetParams'
import { chunkKey } from './tileGrid'
import { EMPTY_WORLD, type WorldState } from './worldState'

const params = planetParamsFor(83921, 1)

/** A tunnel across the border of chunks (0, 8) and (1, 8). */
function hostWorld(): WorldState {
  let world = EMPTY_WORLD
  for (let step = 0; step < 40; step++) {
    const disc = { xMm: 28000 + step * 200, yMm: 284000, radiusMm: 950, floorRadiusMm: null }
    world = carveDisc(world, params, disc, { firstTick: step * 6, ticks: 6 }, () => 24).world
  }
  return world
}

/** The guest's copy of one chunk, one density byte wrong. */
function corrupted(world: WorldState, key: string): WorldState {
  const delta = world.chunks[key]
  const density = [...delta.density]
  density[1] = density[1] ^ 0x10
  return { chunks: { ...world.chunks, [key]: { ...delta, density } } }
}

describe('chunk desync repair (#36 acceptance 5)', () => {
  it('finds the one corrupted guest chunk, repairs it from the host and matches again', () => {
    const host = hostWorld()
    const guest = corrupted(host, chunkKey(1, 8))
    const chunks = touchedChunksOf(host, guest)
    expect(chunks.length).toBeGreaterThan(1)
    const mismatched = mismatchedChunks(host, guest, params, chunks)
    expect(mismatched).toEqual([{ cx: 1, cy: 8 }])
    const repaired = mismatched.reduce(
      (world, chunk) => withChunkRepaired(world, chunkRepairOf(host, chunk)),
      guest,
    )
    expect(mismatchedChunks(host, repaired, params, chunks)).toEqual([])
    expect(stateDigest(repaired)).toBe(stateDigest(host))
  })

  it('sends a few hundred numbers for a chunk with a tunnel through it', () => {
    const repair = chunkRepairOf(hostWorld(), { cx: 0, cy: 8 })
    expect(JSON.stringify(repair).length).toBeLessThan(16 * 1024)
    expect(repair.delta.density.length).toBeGreaterThan(0)
  })
})
