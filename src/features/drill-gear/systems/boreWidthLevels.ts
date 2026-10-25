/**
 * The drill-gear lane's levels on the kernel's one bore width (GD lock on #662 Part B, ticket 749;
 * the #308 ladder as the round-1 question on #662 counted it: "cutters Mark 1, Mark 2, then +1 with
 * Wide"). The widest width Mark the vehicle owns is its level, the side cutters themselves Mark 1,
 * and Wide's gallery reamers add one more while that branch is active. Owned, never switched: the
 * cutters' toggle and their Mark 3 hold leave the width alone and fold only their look (#623).
 * Each level is a price-only purchase with no planet gate and no cap past the Marks sold.
 */
import type { BoreWidthSource } from '../../../systems/registries/boreWidth'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { activeForkBranchOf } from '../../tech-tree'
import { WIDE_BRANCH, WIDE_WIDTH_LEVELS } from './drillGearFork'
import { ownedWidthMarkOf } from './sideCutterMarks'

export const DRILL_GEAR_WIDTH_SOURCE: BoreWidthSource = {
  id: 'drill-gear.width',
  widthLevelsOf: (state, playerId) => markLevelsOf(state, playerId) + wideLevelsOf(state, playerId),
}

function markLevelsOf(state: AuthorityState, playerId: string): number {
  return ownedWidthMarkOf(vehicleOf(state, playerId).loadout)
}

function wideLevelsOf(state: AuthorityState, playerId: string): number {
  const isWide = activeForkBranchOf(state, playerId, 'drill-gear') === WIDE_BRANCH
  return isWide ? WIDE_WIDTH_LEVELS : 0
}
