/**
 * The dock add-ons as real facilities (TD lock on #197, Q2; registry #221): each add-on is the
 * building of its `facility` row, so registering it stamps the row onto the platform from the
 * row's planet on. `builtFacilityRowIdsOn` then answers it, travel logs its `FeatureUnlocked` and
 * the add-on stands on the pad. The row's planet stays in the locked schedule, never copied here.
 */
import { kebabOf } from '../../../systems/art/artNaming'
import type { DockFacility } from '../../../systems/registries/dockFacilities'
import type { DockAddOn } from './dockAddOns'

/** One building per add-on, under the slice's prefix, claiming its schedule row. */
export function dockFacilitiesOf(addOns: readonly DockAddOn[]): DockFacility[] {
  return addOns.map((addOn) => ({
    id: `dock-buildings.${kebabOf(addOn.id)}`,
    scheduleRowId: addOn.rowId,
  }))
}
