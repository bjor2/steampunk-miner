/**
 * The `n` an item track reads (ticket 623; GD lock of 25 Oct on #623, VS input): 0 while its item
 * is not equipped, else the item's owned Mark, 1 for a one-off. Equipped keys on what the player
 * fitted, never on a level or a band: a slotted item counts in any loadout slot whatever its
 * toggle says, a fork branch while its lane's fork has it active. Both come from state the game
 * already keeps (the vehicle's loadout and the tree's fork choices), so nothing new is saved. The
 * fork choice is the tech tree's, which imports this slice, so the caller hands its read in
 * (`activeForkBranchOf` from the scene and the debug read) and this module imports no slice.
 * Allocates nothing: the part swaps ask it every fixed step.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  EMPTY_LOADOUT,
  isItemOwned,
  slotHoldingItem,
  type VehicleLoadout,
} from '../../../systems/vehicle/loadoutState'
import {
  itemLookFrameAt,
  SLOTTED_EQUIP,
  type RigItemLookFrames,
  type RigItemLookRows,
  type RigItemMark,
} from './render/rigItemLooks'
import type { RigLookFrame } from './render/rigLookFrames'

const NO_MARKS: readonly RigItemMark[] = []

/** The branch `lane`'s fork has active for the player, null before it chooses (the tree's read). */
export type ActiveForkBranchRead = (
  state: AuthorityState,
  playerId: string,
  lane: string,
) => string | null

/** What `playerId`'s rig shows on the item track; the base look for a player not in the state. */
export function itemLookOfPlayer(
  frames: RigItemLookFrames,
  state: AuthorityState,
  playerId: string,
  activeBranchOf: ActiveForkBranchRead,
): RigLookFrame {
  return itemLookFrameAt(frames, itemLookCountOf(frames.rows, state, playerId, activeBranchOf))
}

/** The track's `n`: the owned Mark while its item is equipped, 0 otherwise. */
export function itemLookCountOf(
  rows: RigItemLookRows,
  state: AuthorityState,
  playerId: string,
  activeBranchOf: ActiveForkBranchRead,
): number {
  if (!isItemEquipped(rows, state, playerId, activeBranchOf)) return 0
  return ownedMarkOf(rows, loadoutOf(state, playerId))
}

function isItemEquipped(
  rows: RigItemLookRows,
  state: AuthorityState,
  playerId: string,
  activeBranchOf: ActiveForkBranchRead,
): boolean {
  if (rows.equip.kind === SLOTTED_EQUIP) {
    return slotHoldingItem(loadoutOf(state, playerId), rows.track) !== null
  }
  const { lane, branch } = rows.equip
  return lane !== undefined && activeBranchOf(state, playerId, lane) === branch
}

/** The highest Mark whose item is owned, 1 for the item alone. */
function ownedMarkOf(rows: RigItemLookRows, loadout: VehicleLoadout): number {
  let mark = 1
  for (const later of rows.marks ?? NO_MARKS) {
    if (later.mark > mark && isItemOwned(loadout, later.itemId)) mark = later.mark
  }
  return mark
}

function loadoutOf(state: AuthorityState, playerId: string): VehicleLoadout {
  return state.players[playerId]?.vehicle.loadout ?? EMPTY_LOADOUT
}
