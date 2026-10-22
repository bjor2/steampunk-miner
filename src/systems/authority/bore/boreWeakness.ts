/**
 * The bore's own disturbance rule (ticket 313, the TD's point 5 on #309, ruled by the GD): a bore
 * is a disturbance like a blast, but unlike #57's watch it does not ignore bare rock. A wall
 * sample next to a bored tile is weak when its casing is below the grade its band requires,
 * unlined counting as 0 and breached lining as its band's native grade less the gnaw, never below 1
 * (`wallWeakness.ts`, Systems ruling (C) on #676). So an unlined bore always weakens its block, and
 * only lining at the required grade or better holds.
 *
 * "Next to" is edge to edge (a solid 4-neighbour of one of the tile's samples): lining is only
 * ever laid on rock with an air 4-neighbour (`casingLining.ts`), so a sample touching the line at
 * a corner alone could never be lined, and counting it would collapse every bore whatever its
 * lining.
 *
 * It answers the weakest wall as #57's rule does (`BlockWeakness`), the lower grade winning and
 * the first met keeping a tie, walking the tiles in the order given, their samples in row order.
 */
import type { BlockWeakness, SamplePoint } from '../../world/collapseWeakness'
import type { PlanetParams } from '../../world/planetParams'
import { SAMPLES_PER_TILE } from '../../world/sampleGrid'
import { casingAt, isSolidAt, openSampleLayers, type SampleLayers } from '../../world/sampleLayers'
import type { TilePoint } from '../../world/tileGrid'
import { weakerWall } from '../../world/wallWeakness'
import type { WorldState } from '../../world/worldState'

/** The weakest wall beside the bored tiles, or null when every wall holds (or there is none). */
export function boreWeaknessOf(
  world: WorldState,
  params: PlanetParams,
  bored: readonly TilePoint[],
): BlockWeakness | null {
  const layers = openSampleLayers(world, params)
  return wallsBeside(layers, bored).reduce<BlockWeakness | null>(
    (weakest, { sx, sy }) => weakerWall(weakest, casingAt(layers, sx, sy), params, sx, sy),
    null,
  )
}

/** Each solid sample edge to edge with a bored tile's samples, once, in the order first met. */
function wallsBeside(layers: SampleLayers, bored: readonly TilePoint[]): SamplePoint[] {
  const walls = new Map<string, SamplePoint>()
  const neighbours = bored.flatMap(samplesOfTile).flatMap(fourNeighboursOf)
  for (const wall of neighbours.filter(({ sx, sy }) => isSolidAt(layers, sx, sy))) {
    walls.set(`${wall.sx},${wall.sy}`, wall)
  }
  return [...walls.values()]
}

function samplesOfTile(tile: TilePoint): SamplePoint[] {
  const samples: SamplePoint[] = []
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      samples.push({ sx: tile.tx * SAMPLES_PER_TILE + qx, sy: tile.ty * SAMPLES_PER_TILE + qy })
    }
  }
  return samples
}

const EDGE_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
]

function fourNeighboursOf(sample: SamplePoint): SamplePoint[] {
  return EDGE_OFFSETS.map(([dx, dy]) => ({ sx: sample.sx + dx, sy: sample.sy + dy }))
}
