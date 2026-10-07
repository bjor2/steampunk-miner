/**
 * The slot card's link switch (ticket 274, the GD lock on #256): flips the item's sibling-link for
 * the local player through `power-up-core.toggle_link`, so it replays and logs `link_toggled`.
 */
import { submitCommand } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { intentToToggleLink } from '../systems/linkToggle'

export function toggleSiblingLink(itemId: string): void {
  submitCommand(useGameStore.getState().playerId, intentToToggleLink(itemId))
}
