/**
 * How the staged car's turn about its own up axis is drawn (#180 turntable, K-b ticket 227): the
 * art is flat quads in the XY plane, so a turn of θ shows as the orthographic projection of the
 * turned car, its width times cos θ, mirrored past a quarter turn. A flat part seen edge-on would
 * collapse the matrix, so the width never goes below a sliver.
 */

/** The narrowest the car is drawn mid-turn, as a share of its width. */
const EDGE_ON_WIDTH_SHARE = 0.01

/** The car's drawn width as a signed share of its own: 1 as driven, -1 turned half round. */
export function turnedWidthShareOf(radians: number): number {
  const share = Math.cos(radians)
  if (Math.abs(share) >= EDGE_ON_WIDTH_SHARE) return share
  return share < 0 ? -EDGE_ON_WIDTH_SHARE : EDGE_ON_WIDTH_SHARE
}
