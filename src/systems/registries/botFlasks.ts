/**
 * The flask the pacing bot may uncork (ticket 881; the TD's seam on #850, the HS's point 3): the
 * slice whose carried consumable stops a hazard's drain names the command, and the kernel bot sends
 * it only under `kitPolicy.flask: 'on_firedamp_entry'` (`bot/botFlask.ts`), never importing the
 * slice. With no provider, or the policy at its default `never`, the bot reads nothing here and
 * plays byte-identically. Authority still decides: the bot dry-runs the intent before it sends it.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface BotFlaskProvider {
  id: string
  /** The intent uncorking a carried flask; null with none carried or one still open. */
  uncorkIntentOf(state: AuthorityState, playerId: string): CommandIntent | null
}

export const BOT_FLASK_REGISTRY = defineOneProviderRegistry<BotFlaskProvider>('botFlasks')

/** The one provider, or null when no slice registers a flask. */
export function botFlaskProvider(): BotFlaskProvider | null {
  const [provider] = entriesOf(BOT_FLASK_REGISTRY)
  return provider ?? null
}
