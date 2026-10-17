import { beforeAll, describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../authority/authorityState'
import type { CommandIntent } from '../authority/authorityCommand'
import { createScriptedSession, WORLD_SEED } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { sweptColumnAt } from '../authority/sweptColumnFixture'
import { clearDisc } from '../world/groundEdit'
import { freshPlanetParamsFor, planetParamsFor, type PlanetParams } from '../world/planetParams'
import { SOLID_DENSITY } from '../world/sampleGrid'
import { currentCellsOfChunk, type WorldState } from '../world/worldState'
import { packChunkDeltas, unpackChunkDeltas } from './packedChunks'
import { readSaveSlot, saveSlotOf } from './saveSlot'

// Chunk diffs in the save (#401 VS2): only the chunks play changed, packed into one table; a
// planet left behind leaves only the next planet's summary; the size follows the cells changed,
// never the drill speed; a P200 save stays under 5 MB and loads in under 2 s.

const savedText = (state: AuthorityState) => JSON.stringify(saveSlotOf(takeSnapshot(state), 1))

function loadedFrom(text: string): AuthorityState {
  const reading = readSaveSlot(JSON.parse(text))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

const carve = (x: number, y: number): CommandIntent => ({
  type: 'debug.carveCircle',
  payload: { x, y, radius: 3_000, amount: SOLID_DENSITY },
})

/** Planet 1 with three holes carved round the pad's side, across two chunk rows. */
function dugPlanet1(): AuthorityState {
  const session = createScriptedSession()
  session.submit(1, carve(40_500, 290_500))
  session.submit(2, carve(70_500, 270_500))
  session.submit(3, carve(-60_500, 250_500))
  return session.state()
}

describe('chunk diff save', () => {
  it('packs the deltas back to the same deltas, in the same order', () => {
    const { chunks } = dugPlanet1().world
    const unpacked = unpackChunkDeltas(JSON.parse(JSON.stringify(packChunkDeltas(chunks))))
    if (!('chunks' in unpacked)) throw new Error(unpacked.problems.join('; '))
    expect(unpacked.chunks).toEqual(chunks)
    expect(Object.keys(unpacked.chunks)).toEqual(Object.keys(chunks))
  })

  it('holds only the chunks play changed', () => {
    const state = dugPlanet1()
    const file = saveSlotOf(takeSnapshot(state), 1)
    expect(file.world.chunks.chunks).toBe(Object.keys(state.world.chunks).length)
    const untouched = saveSlotOf(takeSnapshot(createScriptedSession().state()), 1)
    expect(untouched.world.chunks).toEqual(packChunkDeltas({}))
  })

  it('collapses a planet left behind to the next planet: its seed, index and params, no chunk', () => {
    const session = createScriptedSession()
    session.submit(1, carve(40_500, 290_500))
    session.submit(2, { type: 'debug.setPlanet', payload: { planetIndex: 2 } })
    const { world } = saveSlotOf(takeSnapshot(session.state()), 1)
    expect(world).toMatchObject({ worldSeed: WORLD_SEED, planetIndex: 2 })
    expect(world.params).toEqual(freshPlanetParamsFor(WORLD_SEED, 2))
    expect(world.chunks).toEqual(packChunkDeltas({}))
  })

  it('refuses a table that does not unpack, and restores nothing', () => {
    const file = JSON.parse(savedText(dugPlanet1()))
    const cut = { ...file, world: { ...file.world, chunks: { ...file.world.chunks, lz4: 'AAAA' } } }
    expect(readSaveSlot(cut).problems).toEqual(['save.world.chunks does not unpack to its chunks'])
    const reshaped = { ...file, world: { ...file.world, chunks: {} } }
    expect(readSaveSlot(reshaped).problems).toEqual([
      'save.world.chunks must hold a chunk count, a byte size and an LZ4 block as base64',
    ])
  })
})

describe('chunk diff size at any drill speed', () => {
  const PATH_METRES = 30
  /** 1, 4 and 16 m a tick down the same column. */
  const [slow, ...faster] = [1_000, 4_000, 16_000].map((stride) =>
    sweptColumnAt(stride, PATH_METRES),
  )
  const sizeOf = (world: WorldState) => packChunkDeltas(world.chunks).lz4.length

  it('changes the same cells at 1, 4 and 16 m a tick', () => {
    for (const run of faster) expect(run.opened).toEqual(slow.opened)
  })

  it('saves the same cells changed in the same size, within 1 percent, at any drill speed', () => {
    for (const run of faster) {
      expect(Math.abs(sizeOf(run.world) - sizeOf(slow.world))).toBeLessThanOrEqual(
        sizeOf(slow.world) / 100,
      )
    }
  })

  it('grows with the cells changed: a shaft twice as deep saves more', () => {
    const deeper = sweptColumnAt(4_000, 2 * PATH_METRES)
    expect(deeper.opened.length).toBeGreaterThan(slow.opened.length)
    expect(sizeOf(deeper.world)).toBeGreaterThan(sizeOf(slow.world))
  })
})

const P200 = planetParamsFor(WORLD_SEED, 200)
const BORE_MM = 1_500
/** The debug carve's widest circle: a longer tunnel is cut as capsules of this length. */
const PIECE_MM = 32_000

interface Point {
  x: number
  y: number
}

const pointAt = (radiusMm: number, turn: number): Point => ({
  x: Math.round(Math.cos(turn * 2 * Math.PI) * radiusMm),
  y: Math.round(Math.sin(turn * 2 * Math.PI) * radiusMm),
})

/** A straight tunnel from `from` to `to`, cleared as the debug carve clears, in capsule pieces. */
function carveTunnel(world: WorldState, params: PlanetParams, from: Point, to: Point): WorldState {
  const pieces = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / PIECE_MM)
  const along = (at: number) => ({
    xMm: Math.round(from.x + ((to.x - from.x) * at) / pieces),
    yMm: Math.round(from.y + ((to.y - from.y) * at) / pieces),
  })
  let carved = world
  for (let piece = 0; piece < pieces; piece++) {
    const disc = { ...along(piece + 1), radiusMm: BORE_MM, floorRadiusMm: null, tail: along(piece) }
    carved = clearDisc(carved, params, disc, SOLID_DENSITY).world
  }
  return carved
}

/**
 * Planet 200 dug far past one visit: 16 shafts from the surface to the core and ring tunnels at
 * 200, 400, 600 and 800 m, about 1,140 of its chunks.
 */
function dugPlanet200(): AuthorityState {
  const start = createAuthorityState({
    planetIndex: 200,
    planetSeed: WORLD_SEED,
    playerIds: ['p1'],
  })
  const surfaceMm = (P200.radiusTiles - 2) * 1000
  const coreMm = (P200.coreRadiusTiles + 5) * 1000
  let world = start.world
  for (let shaft = 0; shaft < 16; shaft++) {
    world = carveTunnel(world, P200, pointAt(surfaceMm, shaft / 16), pointAt(coreMm, shaft / 16))
  }
  for (const ringMm of [200_000, 400_000, 600_000, 800_000]) {
    for (let arc = 0; arc < 64; arc++) {
      world = carveTunnel(world, P200, pointAt(ringMm, arc / 64), pointAt(ringMm, (arc + 1) / 64))
    }
  }
  return { ...start, world }
}

describe('chunk diff save gate at planet 200', () => {
  const FIVE_MB = 5 * 1024 * 1024
  const TWO_SECONDS_MS = 2_000
  let state: AuthorityState
  let text: string

  beforeAll(() => {
    state = dugPlanet200()
    text = savedText(state)
  }, 240_000)

  it('digs over a thousand chunks', () => {
    expect(Object.keys(state.world.chunks).length).toBeGreaterThan(1_000)
  })

  it('writes the save in under 5 MB', () => {
    expect(text.length).toBeLessThan(FIVE_MB)
  })

  it('loads the save from its text in under 2 s', () => {
    const startedMs = performance.now()
    loadedFrom(text)
    expect(performance.now() - startedMs).toBeLessThan(TWO_SECONDS_MS)
  })

  it('regenerates the same terrain: the loaded state hashes as the saved one', () => {
    const loaded = loadedFrom(text)
    expect(stateDigest(loaded)).toBe(stateDigest(state))
    const [cx, cy] = Object.keys(state.world.chunks)[500].split(',').map(Number)
    expect(currentCellsOfChunk(loaded.world, P200, cx, cy)).toEqual(
      currentCellsOfChunk(state.world, P200, cx, cy),
    )
  })
})
