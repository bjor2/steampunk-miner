/**
 * The twists as cache cards (K2's artefact-option registry, GD lock on #206, decisions 3 and 5): a
 * fourth card the cache shows only once the player owns the twist's base item (#162 acceptance 8).
 * Taking it is #46's one pick: the cache's base artefacts are given up, and the pick opens the
 * cache's rows like any other card, never a row of its own.
 *
 * It never previews a held item: not while the player holds an artefact (the one pick is taken),
 * and not for a base item held back from play (the foam items until #202), which no slice
 * registers and so no loadout can own.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { ArtefactOptionEntry } from '../../../systems/registries/artefactOptions'
import { TWISTS, type Twist } from './twistCatalogue'

export const TWIST_OPTIONS: readonly ArtefactOptionEntry[] = TWISTS.map(twistOptionOf)

/** Whether `playerId`'s cache shows `twist`'s card now: nothing held yet, its base item owned. */
export function isTwistOfferedTo(state: AuthorityState, playerId: string, twist: Twist): boolean {
  return isPickOpen(state, playerId) && ownsItem(state, playerId, twist.baseItemId)
}

/** A player in the session who has not taken the run's one artefact yet. */
function isPickOpen(state: AuthorityState, playerId: string): boolean {
  return Object.hasOwn(state.players, playerId) && state.players[playerId].artefact === null
}

function twistOptionOf(twist: Twist): ArtefactOptionEntry {
  return {
    id: twist.optionId,
    name: twist.name,
    summary: twist.summary,
    horizontal: true,
    gateClauses: twist.gateClauses,
    effects: twist.effects,
    iconId: twist.iconId,
    isOfferedTo: (state, playerId) => isTwistOfferedTo(state, playerId, twist),
  }
}
