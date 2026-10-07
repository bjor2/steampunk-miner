/**
 * The power-up cradles (#162 section 2.4, the #200 lock): `slot.powerup_3`, `_4` and `_5`, each a
 * `vehicle-item` that opens one more power-up slot once owned. They go in no slot and are not a
 * power-up class. Bare catalogue ids (#224), so the store, the tree nodes (#165) and the
 * descriptions share one id. No price here: the store buy (20 u at the unlock planet through
 * `bandOrePriceAt`) waits on #165 and the store path.
 */
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUpSlot } from './powerUpSlots'

/** The shipped slots-panel icon until #166 draws the cradles. */
const CRADLE_ICON_ID = 'icon-panel-slots'

/** Each cradle's catalogue id and the slot it opens. */
const CRADLE_OPENINGS: Readonly<Record<string, PowerUpSlot>> = {
  'slot.powerup_3': 'powerup.3',
  'slot.powerup_4': 'powerup.4',
  'slot.powerup_5': 'powerup.5',
}

export const CRADLE_IDS: readonly string[] = Object.keys(CRADLE_OPENINGS)

export const CRADLES: readonly VehicleItem[] = CRADLE_IDS.map(cradleOf)

function cradleOf(id: string): VehicleItem {
  return { id, iconId: CRADLE_ICON_ID, slots: [], attach: null, opensSlot: CRADLE_OPENINGS[id] }
}
