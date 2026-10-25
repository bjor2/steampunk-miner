/**
 * The `kit-item` content kind (ticket 850): one entry per planet kit item the merchants sell, each
 * with its icon, claiming the item's row of the locked schedule (docs/scaling/horizontal/stats.json,
 * re-pinned by #823), so the five rows leave the deferred list as the items go on sale. The item's
 * numbers stay in the kit rows (`planetKits.json`): an entry carries only the item's id, and the
 * vehicle attach point its socket hangs on (`kitSockets.json`), so the content registry refuses a
 * point a gear item also claims (ticket 881, the TD's Q3 on #850).
 */
import type { ContentEntry } from '../../../systems/registries/content'
import type { AttachId } from '../../../systems/registries/vehicleAttach'
import { kitSocketOf, type KitSocket } from './kitSockets'
import type { KitItem } from './planetKitTypes'

export interface KitItemEntry extends ContentEntry {
  /** The kit row's id, which is its schedule row's (`cache_crate`). */
  itemId: string
  /** The point its socket hangs on; absent for an item with none (the Cache Crate). */
  attach?: AttachId
}

declare module '../../../systems/registries/content' {
  interface ContentKinds {
    'kit-item': KitItemEntry
  }
}

/** `item-kit-scree-plough` for `scree_plough`: a file in this slice's icons/. */
export function kitItemIconIdOf(itemId: string): string {
  return `item-kit-${itemId.replaceAll('_', '-')}`
}

export function kitItemEntriesOf(
  items: readonly KitItem[],
  sockets: readonly KitSocket[],
): KitItemEntry[] {
  return items.map((item) => ({
    id: `planet-kit.${item.id}`,
    iconId: kitItemIconIdOf(item.id),
    scheduleRowId: item.id,
    itemId: item.id,
    ...attachFieldOf(kitSocketOf(sockets, item.id)),
  }))
}

function attachFieldOf(socket: KitSocket | null): { attach?: AttachId } {
  return socket === null ? {} : { attach: socket.attach }
}
