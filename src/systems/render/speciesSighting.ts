/**
 * Whether a player's look may show the rarity of a species they met (the skin shows from the
 * first frame, GD ruling on #698): the codex's `material:<species id>`
 * record (ticket 546) through the `kindLook` provider, read only while the authority's
 * `codex.materialContact` is on. HS on #547: the flag "flipped off hides the look but doesn't
 * delete the saved record", so a flip back on shows every species met before it again. Look only.
 */
import type { AuthorityState } from '../authority/authorityState'
import { flagsOf } from '../authority/devFlagState'
import type { KindLookProvider } from '../registries/kindLook'

export function hasSeenSpecies(
  state: AuthorityState,
  playerId: string,
  provider: KindLookProvider,
  speciesId: string,
): boolean {
  return (
    flagsOf(state)['codex.materialContact'] &&
    Object.hasOwn(state.players, playerId) &&
    provider.hasSeenKind(state, playerId, speciesId)
  )
}
