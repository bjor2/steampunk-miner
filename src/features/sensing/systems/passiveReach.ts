/**
 * How far a sensing passive reaches at a Mark (#162 4.4, the Vertical rounding rule of the GD
 * ruling on #203): `reach_n = min(2×base, max(markStepOf(n), reach_{n−1} + 1))`. The tree's
 * rotation rounds each Mark's magnitude to nearest, which can leave two Marks on one whole tile;
 * the rule makes every Mark add at least one tile or cell until the reach first hits its cap. The
 * cap is the ladder's own magnitude at its last Mark, which is twice the base (#161 durationCap).
 */
import { lastMarkOf, markStepOf, type MarkLadder } from '../../tech-tree'
import type { SensingItem } from './sensingCatalogue'
import { markLadderOf, passiveBalanceOf } from './sensingItems'

/** Mark 1 is the item as bought (#162 4.6); Mark 0, none researched, acts as bought. */
const BOUGHT_MARK = 1

/** The passive's radius in tiles or lookahead in cells at `mark`. */
export function passiveReachOf(item: SensingItem, mark: number): number {
  const ladder = markLadderOf(item)
  const cap = magnitudeOf(ladder, lastMarkOf(ladder))
  let reach = passiveBalanceOf(item).magnitude
  for (let next = BOUGHT_MARK + 1; next <= mark; next += 1) {
    reach = Math.min(cap, Math.max(magnitudeOf(ladder, next), reach + 1))
  }
  return reach
}

function magnitudeOf(ladder: MarkLadder, mark: number): number {
  return markStepOf(ladder, mark).stats.magnitude ?? 0
}
