/**
 * What `casingPerMetre.lane.test.ts` reads of a dug leg (the TD's release check on #662): the bore
 * wall's rock samples (solid, beside air) within the casing ring's reach of the path the body
 * took, how many of them are lined per metre of that path, and the largest run of unlined ones
 * touching each other. The first 2 m and the last 3 m of a leg are left out: the cut starts there,
 * and its last rings wait for the ring lag. Test support only.
 */
import { MM_PER_METRE } from '../constants/physics'
import { readPlanetWorld } from '../store/gameStore'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { casingRingAround } from '../systems/world/casingLining'
import type { PlanetParams } from '../systems/world/planetParams'
import {
  chunkOfSample,
  ISO_DENSITY,
  localSampleOf,
  MM_PER_SAMPLE,
  sampleIndexOf,
} from '../systems/world/sampleGrid'
import {
  currentCasingOfChunk,
  currentDensityOfChunk,
  type WorldState,
} from '../systems/world/worldState'

export interface LegCasing {
  /** Metres of path read, its ends left out. */
  lengthM: number
  linedPerMetre: number
  /** The largest run of unlined wall samples touching each other, diagonals included. */
  worstUnlinedRun: number
}

const START_LEFT_OUT_M = 2
const END_LEFT_OUT_M = 3
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
]

/** The leg's casing as the world stands now, `path` being the body's centre each tick, in metres. */
export function casingAlongPath(path: readonly Vector2[]): LegCasing {
  const { params, world } = readPlanetWorld()
  if (params === null) throw new Error('the leg was dug on no planet')
  const kept = pathWithoutEnds(path)
  const ground = { world, params }
  const wall = [...samplesNear(kept.points)].filter((key) => isWallSample(ground, key))
  const unlined = new Set(wall.filter((key) => !isLinedSample(ground, key)))
  return {
    lengthM: kept.lengthM,
    linedPerMetre: (wall.length - unlined.size) / kept.lengthM,
    worstUnlinedRun: largestRunOf(unlined),
  }
}

interface Ground {
  world: WorldState
  params: PlanetParams
}

/** The path's points past its first 2 m and short of its last 3 m, and that length. */
function pathWithoutEnds(path: readonly Vector2[]): { points: Vector2[]; lengthM: number } {
  const along = cumulativeLengthsOf(path)
  const total = along.at(-1) ?? 0
  const points = path.filter(
    (_, at) => along[at] >= START_LEFT_OUT_M && along[at] <= total - END_LEFT_OUT_M,
  )
  return { points, lengthM: Math.max(0, total - START_LEFT_OUT_M - END_LEFT_OUT_M) }
}

function cumulativeLengthsOf(path: readonly Vector2[]): number[] {
  const lengths = [0]
  for (let at = 1; at < path.length; at++) {
    const step = Math.hypot(path[at].x - path[at - 1].x, path[at].y - path[at - 1].y)
    lengths.push(lengths[at - 1] + step)
  }
  return lengths
}

/** Every sample within the ring's outer radius of a point of the path, as `sx,sy` keys. */
function samplesNear(points: readonly Vector2[]): Set<string> {
  const ring = casingRingAround(0, 0)
  const reachMm = ring.clearMm + ring.widthMm
  const span = Math.ceil(reachMm / MM_PER_SAMPLE)
  const near = new Set<string>()
  for (const point of points) {
    const centre = { xMm: point.x * MM_PER_METRE, yMm: point.y * MM_PER_METRE }
    const csx = Math.round(centre.xMm / MM_PER_SAMPLE)
    const csy = Math.round(centre.yMm / MM_PER_SAMPLE)
    for (let sy = csy - span; sy <= csy + span; sy++) {
      for (let sx = csx - span; sx <= csx + span; sx++) {
        const distanceMm = Math.hypot(
          sx * MM_PER_SAMPLE - centre.xMm,
          sy * MM_PER_SAMPLE - centre.yMm,
        )
        if (distanceMm < reachMm) near.add(keyOf(sx, sy))
      }
    }
  }
  return near
}

/** Rock beside air: the sample a ring lines (`casingLining.ts`). */
function isWallSample(ground: Ground, key: string): boolean {
  const [sx, sy] = samplePointOf(key)
  if (densityAt(ground, sx, sy) <= ISO_DENSITY) return false
  return NEIGHBOURS.some(([dx, dy]) => densityAt(ground, sx + dx, sy + dy) <= ISO_DENSITY)
}

function isLinedSample({ world }: Ground, key: string): boolean {
  const [sx, sy] = samplePointOf(key)
  const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))
  return casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] > 0
}

function densityAt({ world, params }: Ground, sx: number, sy: number): number {
  const density = currentDensityOfChunk(world, params, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

/** The size of the largest group of `keys` touching each other, diagonals included. */
function largestRunOf(keys: ReadonlySet<string>): number {
  const seen = new Set<string>()
  let largest = 0
  for (const key of keys) {
    if (!seen.has(key)) largest = Math.max(largest, runSizeFrom(key, keys, seen))
  }
  return largest
}

function runSizeFrom(start: string, keys: ReadonlySet<string>, seen: Set<string>): number {
  const stack = [start]
  seen.add(start)
  let size = 0
  while (stack.length > 0) {
    const [sx, sy] = samplePointOf(stack.pop() ?? start)
    size++
    for (const next of touchingKeysOf(sx, sy)) {
      if (!keys.has(next) || seen.has(next)) continue
      seen.add(next)
      stack.push(next)
    }
  }
  return size
}

function touchingKeysOf(sx: number, sy: number): string[] {
  const keys: string[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) keys.push(keyOf(sx + dx, sy + dy))
  }
  return keys
}

function keyOf(sx: number, sy: number): string {
  return `${sx},${sy}`
}

function samplePointOf(key: string): [number, number] {
  const [sx, sy] = key.split(',').map(Number)
  return [sx, sy]
}
