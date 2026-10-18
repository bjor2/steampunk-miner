/**
 * The debug flag panel's and the badge's models now (ticket 549), for the DOM components: the
 * authority's flags, its taint and who hosts read from the authority, the client loop's flags and
 * the browser's overrides from the store.
 */
import { flagsOf } from '../systems/authority/devFlagState'
import { isSessionHost } from '../systems/authority/sessionHost'
import { devFlagBadgeOf, type DevFlagBadge } from '../systems/devFlags/devFlagBadge'
import {
  devFlagPanelModelOf,
  type DevFlagPanelModel,
  type DevFlagPanelSources,
} from '../systems/devFlags/devFlagPanelModel'
import { readAuthorityState } from './authorityLink'
import { useGameStore } from './gameStore'

export function readDevFlagPanelModel(): DevFlagPanelModel {
  return devFlagPanelModelOf(readDevFlagPanelSources())
}

/** The badge, or null while it is hidden. */
export function readDevFlagBadge(): DevFlagBadge | null {
  return devFlagBadgeOf(readDevFlagPanelSources(), useGameStore.getState().isDevFlagSessionOn)
}

function readDevFlagPanelSources(): DevFlagPanelSources {
  const state = readAuthorityState()
  const game = useGameStore.getState()
  return {
    authority: flagsOf(state),
    client: game.clientDevFlags,
    isEverSet: state.devFlagsEverSet === true,
    isHost: isSessionHost(state, game.playerId),
    overrides: game.devFlagOverrides,
    changedDefaults: game.changedDevFlagDefaults,
    overriddenSaveFlags: game.overriddenSaveFlags,
  }
}
