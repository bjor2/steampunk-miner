/**
 * Which terrain tools ship with their effect (#202) and which stay vision rows: unregistered and
 * unseen by the store, the tree, the item cards and the bots, as the GD lock on #205 Q2 and Q3 holds
 * an item back whose mechanic is not in the game, and an item whose prerequisite is held back.
 *
 * - Stabiliser foam braces cells against collapse and fluid flow: the collapse rule reads no slice
 *   seam a brace could register with, so bracing waits for a kernel seam.
 * - The cryo binder freezes fluid ground, which no planet has yet (`fluid_ground`, frozen planets).
 * - Shoring props hold an open cavern roof, which never collapses today (only weak lined blocks do).
 * - The strata press needs the shoring props node (#161 prereq), so it waits with them.
 */
import { MAGNET_ITEMS, type MagnetItem } from './magnetItems'
import { TERRAIN_ITEMS, type TerrainItem } from './terrainItems'

export const HELD_BACK_ITEM_IDS: readonly string[] = [
  'consumable.stabiliser_foam',
  'consumable.cryo_binder',
  'consumable.shoring_props',
  'power.strata_press',
]

export function isHeldBack(itemId: string): boolean {
  return HELD_BACK_ITEM_IDS.includes(itemId)
}

/** The ore-shifter, seam splitter, pressure pocket lance and lodestone beacon. */
export const SHIPPED_TERRAIN_ITEMS: readonly TerrainItem[] = TERRAIN_ITEMS.filter(
  (item) => !isHeldBack(item.itemId),
)

/** The terrain magnets that ship with their effect: the repulsor coil (ticket 284). */
export const SHIPPED_MAGNET_IDS: readonly string[] = ['power.repulsor_coil']

export const SHIPPED_MAGNET_ITEMS: readonly MagnetItem[] = MAGNET_ITEMS.filter((item) =>
  SHIPPED_MAGNET_IDS.includes(item.itemId),
)
