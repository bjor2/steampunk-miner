/**
 * Whether an extractor is at work now, and for how long it has been (or has stood idle), read off
 * the player's section at the state's tick: what the fold-flat pose (G&V feel pass on #162,
 * `deployFractionOf` in the tech-tree's render rules) takes to unfold a mount while its verb works
 * and fold it back after (#250 hands the fraction to 148b, ticket 237). A channelled verb (tune,
 * pull) works until it ends; a capture, a mark or a harpoon is a one-tick beat.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { extractorStateOf } from './extractorState'

export interface ExtractorWork {
  isWorking: boolean
  /** Ticks since the verb began while it works; since it ended once idle. */
  ticksSinceChange: number
}

/** null for an extractor that has not worked since the save began. */
export function extractorWorkOf(
  state: AuthorityState,
  playerId: string,
  rigId: string,
): ExtractorWork | null {
  const span = extractorStateOf(state, playerId).worked[rigId]
  if (span === undefined) return null
  const isWorking = state.tick <= span.toTick
  return {
    isWorking,
    ticksSinceChange: state.tick - (isWorking ? span.fromTick : span.toTick),
  }
}
