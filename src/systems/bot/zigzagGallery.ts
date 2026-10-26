/**
 * The diagonal-heavy bot's ore gallery shape (ticket 899): a zigzag of 45° legs off the shaft, a
 * leg of `legTiles` down, then as many back up to the gallery's row, and so on, a tile across for
 * each tile down or up. Every tile of it is a 45° step from the one before, so the tunnel it cuts
 * runs all at 45°, √2 m a tile, while the gallery keeps to its own strip of rows: each gallery
 * zigzags in step with the next, three rows apart, so every tile keeps an untouched row above and
 * below it, as the level gallery does. Pure integer geometry along one side of one gallery.
 */

/**
 * How far below its row the gallery runs `reach` tiles from the shaft: a triangle wave from 0 at
 * the shaft down to `legTiles` and back.
 */
export function zigzagDipOf(reach: number, legTiles: number): number {
  return legTiles - Math.abs(legTiles - (reach % (2 * legTiles)))
}

/**
 * The reaches from `fromReach` to `toReach`, either way along the gallery, where the walk turns
 * from one leg to the next, then `toReach` itself: the ends of the straight 45° runs between.
 */
export function zigzagTurnReachesBetween(
  fromReach: number,
  toReach: number,
  legTiles: number,
): number[] {
  const step = Math.sign(toReach - fromReach)
  const turns: number[] = []
  for (let reach = fromReach + step; reach !== toReach; reach += step) {
    if (reach % legTiles === 0) turns.push(reach)
  }
  return [...turns, toReach]
}

/**
 * The steps that climb on the way from `reach` back to the shaft: each step back along a leg that
 * went down on the way out.
 */
export function zigzagClimbStepsOf(reach: number, legTiles: number): number {
  const period = 2 * legTiles
  return Math.floor(reach / period) * legTiles + Math.min(reach % period, legTiles)
}
