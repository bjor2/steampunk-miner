import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { artefactCacheTile } from '../../world/artefactCache'
import { withCellsYielded, withLavaFlipped } from '../../world/chunkDelta'
import { generateChunkCells } from '../../world/generateChunk'
import { planetParamsFor, type PlanetParams } from '../../world/planetParams'
import {
  CHUNK_SIZE,
  cellIndexOfTile,
  chunkOfTile,
  firstTileOfChunk,
  type TilePoint,
} from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { deltaOfChunk, EMPTY_WORLD, withChunkDelta, type WorldState } from '../../world/worldState'
import { createHazardStrip, sampleHazardStrip } from './hazardStripSampler'
import { createSeededStripGround } from './seededStripGround'
import { digFrameAt, VIEWER_WITH_SCANNER } from './stripFixtures'
import { createStripHit, HAZARD_KINDS, STRIP_KIND } from './stripHits'

const SEED = 1

/** Two columns of chunks from the surface to the core, and the artefact cache's chunk. */
function chunksDownTheMiddle(params: PlanetParams): { cx: number; cy: number }[] {
  const top = chunkOfTile(params.radiusTiles - 1)
  const cache = artefactCacheTile(params)
  const column = Array.from({ length: top + 1 }, (_, cy) =>
    [-1, 0].map((cx) => ({ cx, cy: top - cy })),
  ).flat()
  return [...column, { cx: chunkOfTile(cache.tx), cy: chunkOfTile(cache.ty) }]
}

function tilesOfChunk(cx: number, cy: number): TilePoint[] {
  return Array.from({ length: CHUNK_SIZE * CHUNK_SIZE }, (_, at) => ({
    tx: firstTileOfChunk(cx) + (at % CHUNK_SIZE),
    ty: firstTileOfChunk(cy) + Math.floor(at / CHUNK_SIZE),
  }))
}

function hazardKindsOfCell(cell: number): number {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.lava) return STRIP_KIND.lava
  if (kind === CELL_KIND.core) return STRIP_KIND.core
  if (kind === CELL_KIND.artefactCache) return STRIP_KIND.cache
  return kind === CELL_KIND.air ? STRIP_KIND.void : 0
}

/** A slice that puts gate kind 5, which no tip opens, on every ore cell. */
const GATE_EVERY_ORE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.cellGateLook({
      id: 'gate-probe.look',
      cellGateLookOf: (_params, cell) =>
        kindOfCell(cell) === CELL_KIND.ore ? { kind: 5, state: 0 } : null,
      markerTintOf: () => null,
    }),
}

/** The first ore tile of the surface chunk over the centre line. */
function firstSurfaceOre(params: PlanetParams): TilePoint {
  const cy = chunkOfTile(params.radiusTiles - 1)
  const cells = generateChunkCells(params, 0, cy)
  const tile = tilesOfChunk(0, cy).find(
    (candidate) => kindOfCell(cells[cellIndexOfTile(candidate.tx, candidate.ty)]) === CELL_KIND.ore,
  )
  if (tile === undefined) throw new Error('no ore in the surface chunk')
  return tile
}

describe('seeded strip ground', () => {
  it('shows ore under a gate as the gate kind alone, even with the scanner open', () => {
    withRegistrations([GATE_EVERY_ORE], () => {
      const params = planetParamsFor(SEED, 1)
      const ore = firstSurfaceOre(params)
      const above = { x: ore.tx + 0.5, y: ore.ty + 3.5 }
      const length = Math.hypot(above.x, above.y)
      const strip = createHazardStrip()
      const ground = createSeededStripGround(params, EMPTY_WORLD)
      sampleHazardStrip(strip, ground, {
        ...digFrameAt(0, 8, VIEWER_WITH_SCANNER),
        nose: above,
        facing: { x: -above.x / length, y: -above.y / length },
      })
      const [first] = strip.pips.slice(0, strip.pipCount)
      expect([first.kind, first.gateKind]).toEqual(['gate', 5])
      expect(first.metres).toBeLessThanOrEqual(3)
      expect(strip.pips.slice(0, strip.pipCount).some((pip) => pip.kind === 'ore')).toBe(false)
    })
  })

  it.each([1, 8, 28])(
    'reads every tile of planet %i as generateChunk paints it, without generating a chunk',
    (planetIndex) => {
      const params = planetParamsFor(SEED, planetIndex)
      const ground = createSeededStripGround(params, EMPTY_WORLD)
      for (const { cx, cy } of chunksDownTheMiddle(params)) {
        const cells = generateChunkCells(params, cx, cy)
        const read = tilesOfChunk(cx, cy).map((tile) => ground.generatedCellAt(tile))
        expect(read).toEqual([...cells])
      }
    },
  )

  it('finds the artefact cache, the core and lava as hazards from the seed', () => {
    const params = planetParamsFor(SEED, 8)
    const ground = createSeededStripGround(params, EMPTY_WORLD)
    const found = chunksDownTheMiddle(params)
      .flatMap(({ cx, cy }) => tilesOfChunk(cx, cy))
      .reduce((kinds, tile) => {
        const hit = createStripHit()
        ground.readTile(tile, hit)
        return kinds | hit.kinds
      }, 0)
    expect(found & HAZARD_KINDS).toBe(
      STRIP_KIND.lava | STRIP_KIND.void | STRIP_KIND.core | STRIP_KIND.cache,
    )
  })

  it('reads lava that flowed into a tile and never a tunnel the rig dug', () => {
    const params = planetParamsFor(SEED, 1)
    const cache = artefactCacheTile(params)
    const flowed = { tx: cache.tx + 2, ty: cache.ty }
    const dug = { tx: cache.tx - 2, ty: cache.ty }
    const world = withEdits(EMPTY_WORLD, flowed, dug)
    const ground = createSeededStripGround(params, world)
    const hit = createStripHit()
    ground.readTile(flowed, hit)
    expect(hit.kinds).toBe(STRIP_KIND.lava)
    ground.readTile(dug, hit)
    expect(hit.kinds).toBe(0)
  })

  it('sees an edit as soon as the world it reads carries it', () => {
    const params = planetParamsFor(SEED, 1)
    const cache = artefactCacheTile(params)
    const flowed = { tx: cache.tx + 2, ty: cache.ty }
    const ground = createSeededStripGround(params, EMPTY_WORLD)
    const versionBefore = ground.chunkVersionOf(chunkOfTile(flowed.tx), chunkOfTile(flowed.ty))
    ground.world = withEdits(EMPTY_WORLD, flowed, { tx: cache.tx - 2, ty: cache.ty })
    const hit = createStripHit()
    ground.readTile(flowed, hit)
    expect(hit.kinds).toBe(STRIP_KIND.lava)
    expect(ground.chunkVersionOf(chunkOfTile(flowed.tx), chunkOfTile(flowed.ty))).not.toBe(
      versionBefore,
    )
  })

  it.each([1, 8, 28])(
    'never misses a hazard of planet %i in its lattice blocks or its bands (tiers 3 and 4)',
    (planetIndex) => {
      const params = planetParamsFor(SEED, planetIndex)
      const ground = createSeededStripGround(params, EMPTY_WORLD)
      const missed = chunksDownTheMiddle(params).flatMap(({ cx, cy }) => {
        const cells = generateChunkCells(params, cx, cy)
        return tilesOfChunk(cx, cy).filter((tile) => {
          const kinds = hazardKindsOfCell(cells[cellIndexOfTile(tile.tx, tile.ty)])
          const isDockAir = kinds === STRIP_KIND.void && isAboveTheCave(params, tile)
          if (kinds === 0 || isDockAir) return false
          return (
            (ground.blockKindsAt(tile) & kinds) !== kinds ||
            (ground.bandKindsAt(tile) & kinds) !== kinds
          )
        })
      })
      expect(missed).toEqual([])
    },
  )
})

/** Lava flowed into one tile; another tile yielded, as the drill leaves it. */
function withEdits(world: WorldState, flowed: TilePoint, dug: TilePoint): WorldState {
  const edit = (into: WorldState, tile: TilePoint, change: 'flow' | 'dig') => {
    const [cx, cy] = [chunkOfTile(tile.tx), chunkOfTile(tile.ty)]
    const index = cellIndexOfTile(tile.tx, tile.ty)
    const delta = deltaOfChunk(into, cx, cy)
    const edited =
      change === 'flow' ? withLavaFlipped(delta, [index]) : withCellsYielded(delta, [index])
    return withChunkDelta(into, cx, cy, edited)
  }
  return edit(edit(world, flowed, 'flow'), dug, 'dig')
}

/** Band 1 has no caves: open air there is the dock's clearance, which no tier warns of. */
function isAboveTheCave(params: PlanetParams, tile: TilePoint): boolean {
  const distanceSq = (2 * tile.tx + 1) ** 2 + (2 * tile.ty + 1) ** 2
  return distanceSq > params.bandStartsHalfTileSq[0]
}
