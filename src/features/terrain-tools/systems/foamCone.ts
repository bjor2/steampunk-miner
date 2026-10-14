/**
 * Where stabiliser foam lands (the GD default ruling on #381, ticket 381): a forward cone from the
 * rig's tile, `radius` cells deep. A tile is in the cone when it lies ahead along the facing step,
 * no further to the side than ahead (a quarter turn wide), and within the radius. Integer only, in
 * a fixed order (`tx`, then `ty`), so every machine sprays the same cells.
 */
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { GridStep } from './editGeometry'

/** The cone's tiles, sorted by `tx`, then `ty`; the rig's own tile is never one. */
export function tilesInForwardCone(origin: TilePoint, step: GridStep, radius: number): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (isInCone({ x: dx, y: dy }, step, radius)) {
        tiles.push({ tx: origin.tx + dx, ty: origin.ty + dy })
      }
    }
  }
  return tiles
}

/**
 * Ahead is the offset's dot product with the step, aside its cross product: both carry the same
 * scale on a diagonal step, so "no further aside than ahead" holds at any facing.
 */
function isInCone(offset: GridStep, step: GridStep, radius: number): boolean {
  const ahead = offset.x * step.x + offset.y * step.y
  const aside = Math.abs(offset.x * step.y - offset.y * step.x)
  const isWithinRadius = offset.x * offset.x + offset.y * offset.y <= radius * radius
  return ahead > 0 && aside <= ahead && isWithinRadius
}
