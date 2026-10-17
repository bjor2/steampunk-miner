/**
 * The byte-identity fixtures of ticket 446 (TD ruling 6226236698 section 5, addendum 6226264758
 * amendment 4): the roster fold switched off at the same planet, all else equal; a planet's cells
 * with the kind slot masked away, digested the way main's frozen P1/P2 digest was taken; and every
 * patch's drawn kind, the stream the share checks count. Only specs use it.
 */
import { createSeededRandom } from '../../systems/seededRandom'
import { fnv1a64Hex } from '../../systems/authority/stateDigest'
import { GENERATION_HOOK_REGISTRY } from '../../systems/registries/generationHooks'
import { createRegistrySet, swapRegistrySet, type RegistrySet } from '../../systems/registries/seal'
import { chunkDigest } from '../../systems/world/chunkDigest'
import { generateChunk, patchCellOf, patchesForChunk } from '../../systems/world/generateChunk'
import type { OrePatch } from '../../systems/world/orePatches'
import type { PlanetParams } from '../../systems/world/planetParams'
import { bandOfTile } from '../../systems/world/planetGeometry'
import { CHUNK_SIZE, chunkRangeOfDisc, firstTileOfChunk } from '../../systems/world/tileGrid'
import {
  CELL_KIND,
  familyOfCell,
  kindOfCell,
  kindSlotOfCell,
  tierOffsetOfCell,
  withoutKindSlot,
} from '../../systems/world/worldCell'
import { ROSTER_HOOK_ID } from './systems/rosterFold'

/** The 8 named seeds: the three pacing seeds, the edges of the uint32 range and a few more. */
export const NAMED_SEEDS: readonly number[] = [83921, 31415, 27182, 0, 1, 42, 20261017, 4294967295]

const STREAMED_SEED_COUNT = 56
const STREAM_SEED = 446
const TWO_TO_32 = 0x100000000

/** The 64 seeds of part A: the named 8, then 56 from a seeded stream. */
export function byteIdentitySeeds(): number[] {
  const random = createSeededRandom(STREAM_SEED)
  const streamed = Array.from({ length: STREAMED_SEED_COUNT }, () => random.nextInt(TWO_TO_32))
  return [...NAMED_SEEDS, ...streamed]
}

/** Runs `run` on the loaded registrations without the roster fold, then puts them back. */
export function withRosterOff<T>(run: () => T): T {
  const loaded = swapRegistrySet(createRegistrySet())
  try {
    swapRegistrySet(registrySetWithoutRoster(loaded))
    return run()
  } finally {
    swapRegistrySet(loaded)
  }
}

/** One ore cell's place in the census: its band, family code, tier offset and kind slot. */
export interface CensusRow {
  band: number
  family: number
  tierOffset: number
  kindSlot: number
  cells: number
}

export interface PlanetCensus {
  /** Every chunk's cells with the kind slot masked, and its density, then the ore counts. */
  maskedDigest: string
  /** Ore cells by band, family, tier offset and kind slot, sorted. */
  rows: readonly CensusRow[]
}

/**
 * The whole planet, chunk by chunk: the digest of what every reader but the look sees (main's
 * frozen digest at f49323ba used this exact recipe), and the ore cells counted per kind.
 */
export function planetCensusOf(params: PlanetParams): PlanetCensus {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const digests: string[] = []
  const counts = new Map<string, number>()
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) {
      const chunk = generateChunk(params, cx, cy)
      const cells = chunk.cells.map(withoutKindSlot)
      digests.push(chunkDigest({ cells, density: chunk.density }))
      countOreCells(params, chunk.cells, cx, cy, counts)
    }
  }
  const rows = censusRowsOf(counts)
  return { maskedDigest: fnv1a64Hex(digests.join('') + JSON.stringify(maskedCountsOf(rows))), rows }
}

/** One planet patch: its band, centre, family and lead, and the kind it drew. */
export interface PatchDraw {
  band: number
  family: number
  lead: number
  kindSlot: number
}

/** Every patch of the planet once, in chunk order, with what the generation hooks folded into it. */
export function patchDrawsOf(params: PlanetParams): PatchDraw[] {
  const { min, max } = chunkRangeOfDisc(params.radiusTiles)
  const seen = new Set<string>()
  const draws: PatchDraw[] = []
  for (let cy = min; cy <= max; cy++) {
    for (let cx = min; cx <= max; cx++) {
      const fresh = patchesForChunk(params, cx, cy).filter((patch) => isFirstSight(patch, seen))
      draws.push(...fresh.map((patch) => patchDrawOf(params, patch)))
    }
  }
  return draws
}

function patchDrawOf(params: PlanetParams, patch: OrePatch): PatchDraw {
  const cell = patchCellOf(params, patch)
  return {
    band: patch.band,
    family: familyOfCell(cell),
    lead: tierOffsetOfCell(cell) - (patch.band - 1),
    kindSlot: kindSlotOfCell(cell),
  }
}

function isFirstSight(patch: OrePatch, seen: Set<string>): boolean {
  const key = `${patch.band}:${patch.centre.tx}:${patch.centre.ty}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
}

function registrySetWithoutRoster(loaded: RegistrySet): RegistrySet {
  const shelves = new Map(loaded.shelves)
  const shelf = loaded.shelves.get(GENERATION_HOOK_REGISTRY)
  if (shelf !== undefined) {
    shelves.set(GENERATION_HOOK_REGISTRY, {
      registrations: shelf.registrations.filter(({ entry }) => entry.id !== ROSTER_HOOK_ID),
      sorted: shelf.sorted.filter((entry) => entry.id !== ROSTER_HOOK_ID),
    })
  }
  return { isSealed: loaded.isSealed, shelves }
}

function countOreCells(
  params: PlanetParams,
  cells: Uint32Array,
  cx: number,
  cy: number,
  counts: Map<string, number>,
): void {
  cells.forEach((cell, index) => {
    if (kindOfCell(cell) !== CELL_KIND.ore) return
    const tx = firstTileOfChunk(cx) + (index % CHUNK_SIZE)
    const ty = firstTileOfChunk(cy) + Math.floor(index / CHUNK_SIZE)
    const key = [bandOfTile(params, tx, ty), familyOfCell(cell), tierOffsetOfCell(cell)]
    const slotted = `${key.join(':')}:${kindSlotOfCell(cell)}`
    counts.set(slotted, (counts.get(slotted) ?? 0) + 1)
  })
}

function censusRowsOf(counts: ReadonlyMap<string, number>): CensusRow[] {
  return [...counts.entries()]
    .map(([key, cells]) => {
      const [band, family, tierOffset, kindSlot] = key.split(':').map(Number)
      return { band, family, tierOffset, kindSlot, cells }
    })
    .sort(byCensusKey)
}

/** Ore cells by `band:family:tierOffset`, the kind slot folded away, as main's digest keyed them. */
export function maskedCountsOf(rows: readonly CensusRow[]): [string, number][] {
  const masked = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.band}:${row.family}:${row.tierOffset}`
    masked.set(key, (masked.get(key) ?? 0) + row.cells)
  }
  return [...masked.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

function byCensusKey(a: CensusRow, b: CensusRow): number {
  return (
    a.band - b.band || a.family - b.family || a.tierOffset - b.tierOffset || a.kindSlot - b.kindSlot
  )
}
