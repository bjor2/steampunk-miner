/**
 * Side cutters and the reach boom on the kernel's drill gear read (feature-slices.md 3.28, the GD
 * lock on #205): while switched on, the boom cuts one cell past the bit. The kernel lists only cells
 * that pass `canMine` at the drill's own power and tip, holds the reach to its cap, and carves,
 * collects and charges them with the bit's cut; a gated cell stays standing as a notch, reported
 * in the drill's `DrillGated`.
 *
 * The side cutters ask the drill for nothing (GD lock on #662 Part B, ticket 749): owning them is
 * the width Mark 1 on the kernel's one bore width (`boreWidthLevels.ts`), so their switch and
 * their Mark 3 hold (`cuttersHold.ts`) leave the cut alone and fold only their look (#623).
 */
import type { DrillGearAsk } from '../../../systems/economy/drillGearCaps'
import type { DrillGearSource } from '../../../systems/registries/drillGear'
import { isToggleEngaged } from '../../power-up-core'
import { gearValueOf } from './drillGearItems'

export const SIDE_CUTTERS_ID = 'gear.side_cutters'
export const REACH_BOOM_ID = 'gear.reach_boom'

export const CUTTERS_AND_BOOM_SOURCE: DrillGearSource = {
  id: 'drill-gear.cutters-and-boom',
  gearOf: (state, playerId) => drillGearAskOf((itemId) => isToggleEngaged(state, playerId, itemId)),
}

/** What the engaged toggles ask of the drill: the boom's cell past the bit; null while it is off. */
export function drillGearAskOf(isEngaged: (itemId: string) => boolean): DrillGearAsk | null {
  return isEngaged(REACH_BOOM_ID) ? reachBoomAsk() : null
}

function reachBoomAsk(): DrillGearAsk {
  return { aheadCells: gearValueOf(REACH_BOOM_ID, 'aheadCells') }
}
