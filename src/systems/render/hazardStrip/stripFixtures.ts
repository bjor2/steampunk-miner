/**
 * Strip fixtures (ticket 341): a straight dig down from the top of a wide planet of plain ground,
 * with what lies on the line placed by its distance below the start, and a run of frames at a
 * steady speed. The specs and `npm run bench:strip` drive the sampler through these, so a fixture
 * says where a hazard is in metres along the drive and nothing about chunks or seeds.
 */
import { NO_COLLAPSE } from '../../authority/collapse/collapseState'
import { CAVE_LATTICE_TILES } from '../../world/baseTerrain'
import { chunkOfTile, type TilePoint } from '../../world/tileGrid'
import type { StripFrame } from './hazardStripSampler'
import type { StripGround } from './stripGround'
import { clearStripHit, NEVER_BY_TIP, NO_GATE, STRIP_KIND, type StripHit } from './stripHits'
import type { StripViewer } from './stripPips'

/** The planet's radius: wide enough that a fixture at 10,000 m/s never reaches the core. */
export const FIXTURE_RADIUS_M = 1_000_000
/** The dig starts here, at a tile centre on the column right of the centre line. */
export const FIXTURE_START = { x: 0.5, y: FIXTURE_RADIUS_M - 9.5 }
export const DOWN = { x: 0, y: -1 }

/** What one row of the line holds, `metres` below the start. */
export interface LineFixture {
  metres: number
  hit: Partial<StripHit>
}

export interface FixtureGround extends StripGround {
  /** Puts a fixture on the line as an edit: its chunk's version moves on. */
  editLine(fixture: LineFixture): void
}

const BAND_KINDS = STRIP_KIND.lava | STRIP_KIND.void

export function createFixtureGround(fixtures: readonly LineFixture[]): FixtureGround {
  const rows = new Map<number, Partial<StripHit>>()
  const versions = new Map<number, number>()
  const place = (fixture: LineFixture) => rows.set(rowOf(fixture.metres), fixture.hit)
  fixtures.forEach(place)
  return {
    radiusMetres: FIXTURE_RADIUS_M,
    chunkVersionOf: (_cx, cy) => versions.get(cy) ?? 0,
    readTile: (tile, out) => readFixtureTile(rows, tile, out),
    blockKindsAt: (tile) => blockKindsOfRows(rows, tile),
    bandKindsAt: () => BAND_KINDS,
    editLine: (fixture) => {
      place(fixture)
      const cy = chunkOfTile(rowOf(fixture.metres))
      versions.set(cy, (versions.get(cy) ?? 0) + 1)
    },
  }
}

/** The frame of a rig `seconds` into a dig down from the start at `speed` metres a second. */
export function digFrameAt(seconds: number, speed: number, viewer: StripViewer): StripFrame {
  return {
    nose: { x: FIXTURE_START.x, y: FIXTURE_START.y - speed * seconds },
    facing: DOWN,
    feltSpeed: speed,
    windowSeconds: 2,
    tick: 0,
    collapse: NO_COLLAPSE,
    viewer,
  }
}

export const VIEWER_BEFORE_SCANNER: StripViewer = { isScannerOpen: false, tipMajor: 0, rigBand: 1 }
export const VIEWER_WITH_SCANNER: StripViewer = { ...VIEWER_BEFORE_SCANNER, isScannerOpen: true }

/** A lava row across the line. */
export function lavaAt(metres: number): LineFixture {
  return { metres, hit: { kinds: STRIP_KIND.lava } }
}

/** Ore of `tierOffset`, gated or not. */
export function oreAt(metres: number, tierOffset: number): LineFixture {
  return { metres, hit: { kinds: STRIP_KIND.ore, oreTierOffset: tierOffset } }
}

/** Ore behind a gate of `gateKind` that no tip opens. */
export function gateAt(metres: number, gateKind: number): LineFixture {
  return {
    metres,
    hit: {
      kinds: STRIP_KIND.ore | STRIP_KIND.gate,
      oreTierOffset: 0,
      gateKind,
      gateOpensAtTipMajor: NEVER_BY_TIP,
    },
  }
}

export function cacheAt(metres: number): LineFixture {
  return { metres, hit: { kinds: STRIP_KIND.cache } }
}

function rowOf(metres: number): number {
  return Math.floor(FIXTURE_START.y - metres)
}

/** Fixtures lie across the line: every tile of their row near the centre line holds them. */
function readFixtureTile(
  rows: Map<number, Partial<StripHit>>,
  tile: TilePoint,
  out: StripHit,
): void {
  clearStripHit(out)
  const hit = Math.abs(tile.tx) <= 2 ? rows.get(tile.ty) : undefined
  if (hit === undefined) return
  out.kinds = hit.kinds ?? 0
  out.gateKind = hit.gateKind ?? NO_GATE
  out.gateOpensAtTipMajor = hit.gateOpensAtTipMajor ?? NEVER_BY_TIP
  out.oreTierOffset = hit.oreTierOffset ?? -1
}

/** A lattice block holds every hazard kind of the rows it spans; ore never shows at tier 3. */
function blockKindsOfRows(rows: Map<number, Partial<StripHit>>, tile: TilePoint): number {
  const firstRow = Math.floor(tile.ty / CAVE_LATTICE_TILES) * CAVE_LATTICE_TILES
  let kinds = 0
  for (let row = firstRow; row < firstRow + CAVE_LATTICE_TILES; row++) {
    kinds |= (rows.get(row)?.kinds ?? 0) & ~(STRIP_KIND.ore | STRIP_KIND.gate)
  }
  return kinds
}
