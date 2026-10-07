/**
 * Side cutters and the reach boom on the kernel's drill gear read (feature-slices.md 3.28, the GD
 * lock on #205): while switched on, the side cutters widen the bore by their side cells at their
 * share of the drill's energy, and the boom cuts one cell past the bit. The kernel lists only cells
 * that pass `canMine` at the drill's own power and tip, holds the reach to its cap and the side
 * share at or above a whole share, and carves, collects and charges them with the bit's cut; a
 * gated cell stays standing as a notch, reported in the drill's `DrillGated`.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DrillGearAsk } from '../../../systems/economy/drillGearCaps'
import type { DrillGearSource } from '../../../systems/registries/drillGear'
import { isToggleEngaged } from '../../power-up-core'
import { gearValueOf } from './drillGearItems'

export const SIDE_CUTTERS_ID = 'gear.side_cutters'
export const REACH_BOOM_ID = 'gear.reach_boom'

export const CUTTERS_AND_BOOM_SOURCE: DrillGearSource = {
  id: 'drill-gear.cutters-and-boom',
  gearOf: (state: AuthorityState, playerId: string) =>
    drillGearAskOf((itemId) => isToggleEngaged(state, playerId, itemId)),
}

/** What the engaged toggles ask of the drill; null while neither is on. */
export function drillGearAskOf(isEngaged: (itemId: string) => boolean): DrillGearAsk | null {
  const sideCutters = isEngaged(SIDE_CUTTERS_ID) ? sideCuttersAsk() : null
  const reachBoom = isEngaged(REACH_BOOM_ID) ? reachBoomAsk() : null
  if (sideCutters === null && reachBoom === null) return null
  return { ...sideCutters, ...reachBoom }
}

function sideCuttersAsk(): DrillGearAsk {
  return {
    sideCells: gearValueOf(SIDE_CUTTERS_ID, 'sideCells'),
    sideEnergyShareBp: gearValueOf(SIDE_CUTTERS_ID, 'sideEnergyShareBp'),
  }
}

function reachBoomAsk(): DrillGearAsk {
  return { aheadCells: gearValueOf(REACH_BOOM_ID, 'aheadCells') }
}
