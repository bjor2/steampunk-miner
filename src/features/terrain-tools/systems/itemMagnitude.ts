/**
 * The size a terrain tool works at for a Mark (#162 4.6): the tree's Mark rotation over the item's
 * `items.balance` row, held at the TD's terrain cap. In play every use acts at Mark 1, the item as
 * bought: Marks take effect in play in a `power-up-core` follow-up (the GD lock on #204 Q7), and
 * every planner already takes the Mark, so that follow-up changes no rule here.
 */
import { markStepOf } from '../../tech-tree'
import { balanceOf, markLadderOf, terrainItemOf, type TerrainItem } from './terrainItems'

/** The Mark a use acts at until the tree's Marks reach play: the item as bought. */
export const MARK_IN_PLAY = 1

/** The catalogue row of an item this lane sells; any other id is a programming error. */
export function terrainItemNamed(itemId: string): TerrainItem {
  const item = terrainItemOf(itemId)
  if (item === null) throw new RangeError(`${itemId} is not a terrain tool`)
  return item
}

export function magnitudeAt(item: TerrainItem, mark: number): number {
  return markStepOf(markLadderOf(item), mark).stats.magnitude ?? balanceOf(item).magnitude
}

/** The radius or reach the item works within apart from its size; its size where it has none. */
export function reachOf(item: TerrainItem): number {
  return balanceOf(item).reachTiles ?? balanceOf(item).magnitude
}
