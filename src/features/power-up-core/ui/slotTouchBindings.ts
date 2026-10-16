/**
 * The slot column's touch bindings (#474, the HS decision on #470): one row per tile the column can
 * draw, slots 1-5 then the drill sockets (#244), each a tap of the tile's key, shown while its slot
 * holds an item. Every row is drawn by the one column, which still shows only the tiles a press
 * can use; the whistle, the governor's powers, the grapple and the lode clamp all reach the sim
 * through these taps, a hold-used item held from finger-down to lift (ticket 332).
 */
import type { TouchBindingRow } from '../../../ui/registries/touchBindings'
import { actionOfTile, PRESSABLE_SLOTS } from '../systems/powerUpSlots'
import { SlotColumn } from './SlotColumn'

export const SLOT_TOUCH_BINDINGS: readonly TouchBindingRow[] = PRESSABLE_SLOTS.map((slot) => ({
  id: `power-up-core.${actionOfTile(slot)}`,
  anchor: { slot },
  touch: { gesture: 'tap', action: actionOfTile(slot) },
  Tile: SlotColumn,
}))
