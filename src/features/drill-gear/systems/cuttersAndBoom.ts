/**
 * Side cutters and the reach boom on the kernel's drill gear read (feature-slices.md 3.28, the GD
 * lock on #205): while switched on, the side cutters widen the bore by their side cells at their
 * share of the drill's energy, and the boom cuts one cell past the bit. The kernel lists only cells
 * that pass `canMine` at the drill's own power and tip, holds the reach to its cap and the side
 * share at or above a whole share, and carves, collects and charges them with the bit's cut; a
 * gated cell stays standing as a notch, reported in the drill's `DrillGated`.
 *
 * Held at Mark 3 (#276), the cutters ask only for the side the player steers toward
 * (`cuttersHold.ts`): the same cells and share on that side, none on the other. With a width Mark
 * owned (ticket 620, `sideCutterMarks.ts`) they cut its side cells instead of their own one.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { DrillGearAsk } from '../../../systems/economy/drillGearCaps'
import type { DrillGearSource } from '../../../systems/registries/drillGear'
import { isToggleEngaged } from '../../power-up-core'
import { facedHoldOf, type FacedHold } from './cuttersHold'
import { gearValueOf } from './drillGearItems'
import { ownedSideCutterCellsOf } from './sideCutterMarks'

export const SIDE_CUTTERS_ID = 'gear.side_cutters'
export const REACH_BOOM_ID = 'gear.reach_boom'

export const CUTTERS_AND_BOOM_SOURCE: DrillGearSource = {
  id: 'drill-gear.cutters-and-boom',
  gearOf: (state: AuthorityState, playerId: string) =>
    gearAskInPlayOf(state, playerId, (itemId) => isToggleEngaged(state, playerId, itemId)),
}

/**
 * What the toggles `isEngaged` names ask of the player's drill now: the cutters at the hold they
 * keep and the widest width Mark the vehicle owns (ticket 620). Null while neither is on.
 */
export function gearAskInPlayOf(
  state: AuthorityState,
  playerId: string,
  isEngaged: (itemId: string) => boolean,
): DrillGearAsk | null {
  const facedHold = facedHoldOf(state, playerId, SIDE_CUTTERS_ID)
  return drillGearAskOf(isEngaged, facedHold, cutterSideCellsOf(state, playerId))
}

/** What the engaged toggles ask of the drill, the cutters at `sideCells`; null while neither is on. */
export function drillGearAskOf(
  isEngaged: (itemId: string) => boolean,
  facedHold: FacedHold | null = null,
  sideCells: number = gearValueOf(SIDE_CUTTERS_ID, 'sideCells'),
): DrillGearAsk | null {
  const sideCutters = isEngaged(SIDE_CUTTERS_ID) ? sideCuttersAsk(facedHold, sideCells) : null
  const reachBoom = isEngaged(REACH_BOOM_ID) ? reachBoomAsk() : null
  if (sideCutters === null && reachBoom === null) return null
  return { ...sideCutters, ...reachBoom }
}

/** The owned width Mark's side cells, or the cutters' own Mark 1 with none owned. */
function cutterSideCellsOf(state: AuthorityState, playerId: string): number {
  const owned = ownedSideCutterCellsOf(vehicleOf(state, playerId).loadout)
  return owned ?? gearValueOf(SIDE_CUTTERS_ID, 'sideCells')
}

/** Both sides; with the hold, only the faced one, seeded from where the hold started. */
function sideCuttersAsk(facedHold: FacedHold | null, sideCells: number): DrillGearAsk {
  const ask = { sideCells, sideEnergyShareBp: gearValueOf(SIDE_CUTTERS_ID, 'sideEnergyShareBp') }
  return facedHold === null ? ask : { ...ask, sideAim: 'drive', sideSeed: facedHold.seed }
}

function reachBoomAsk(): DrillGearAsk {
  return { aheadCells: gearValueOf(REACH_BOOM_ID, 'aheadCells') }
}
