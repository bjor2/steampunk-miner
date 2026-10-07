/**
 * The size a terrain tool works at for a Mark (#162 4.6): the tree's Mark rotation over the item's
 * `items.balance` row, held at the TD's terrain cap. A use acts at the Mark the player researched
 * (`power-up-core`, #249); Mark 0, an item researched none of, acts as bought, at Mark 1.
 */
import { markStepOf } from '../../tech-tree'
import { balanceOf, markLadderOf, terrainItemOf, type TerrainItem } from './terrainItems'

/** Mark 1 is the item as bought (#162 4.6). */
const BOUGHT_MARK = 1

/** The catalogue row of an item this lane sells; any other id is a programming error. */
export function terrainItemNamed(itemId: string): TerrainItem {
  const item = terrainItemOf(itemId)
  if (item === null) throw new RangeError(`${itemId} is not a terrain tool`)
  return item
}

export function magnitudeAt(item: TerrainItem, mark: number): number {
  const step = markStepOf(markLadderOf(item), Math.max(mark, BOUGHT_MARK))
  return step.stats.magnitude ?? balanceOf(item).magnitude
}
