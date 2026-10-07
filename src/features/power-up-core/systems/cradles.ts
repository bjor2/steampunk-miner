/**
 * The power-up cradles (#162 section 2.4, the #200 lock): `slot.powerup_3`, `_4` and `_5`, each a
 * `vehicle-item` that opens one more power-up slot once owned. They go in no slot and are not a
 * power-up class. Bare catalogue ids (#224), so the store, the tree nodes (#165) and the
 * descriptions share one id. Names and flavour lines are #162's; the price is `cradleSales.ts`.
 */
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import type { PowerUpSlot } from './powerUpSlots'

/** The shipped slots-panel icon until #166 draws the cradles. */
const CRADLE_ICON_ID = 'icon-panel-slots'

export interface CradleRow {
  id: string
  /** The slot owning it opens. */
  opens: PowerUpSlot
  name: string
  /** No digits, at most 80 characters (#159). */
  flavour: string
}

export const CRADLE_ROWS: readonly CradleRow[] = [
  {
    id: 'slot.powerup_3',
    opens: 'powerup.3',
    name: 'Third power-up cradle',
    flavour: 'A third sprung cradle on the deck for one more gadget below.',
  },
  {
    id: 'slot.powerup_4',
    opens: 'powerup.4',
    name: 'Fourth power-up cradle',
    flavour: 'Another sprung cradle on the deck for one more gadget below.',
  },
  {
    id: 'slot.powerup_5',
    opens: 'powerup.5',
    name: 'Fifth power-up cradle',
    flavour: 'The last cradle the deck can bear, for one more instrument below.',
  },
]

export const CRADLE_IDS: readonly string[] = CRADLE_ROWS.map((row) => row.id)

export const CRADLES: readonly VehicleItem[] = CRADLE_ROWS.map(cradleOf)

export function cradleRowOf(itemId: string): CradleRow | null {
  return CRADLE_ROWS.find((row) => row.id === itemId) ?? null
}

function cradleOf({ id, opens }: CradleRow): VehicleItem {
  return { id, iconId: CRADLE_ICON_ID, slots: [], attach: null, opensSlot: opens }
}
