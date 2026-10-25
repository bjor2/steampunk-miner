/**
 * The crates the pacing bot may cache its hold in (ticket 850; the TD's Q4 seam and the GD's
 * final lock on #850): the slice whose carried consumable drops the hold as a container names the
 * commands, and the kernel bot sends them only under `kitPolicy.crates: 'drop_on_full'`
 * (`bot/botCrates.ts`), never importing the slice. With no provider, or the policy at its default
 * `never`, the bot reads nothing here and plays byte-identically.
 *
 * Authority still decides every intent: the bot dry-runs each before it sends it, and a refused
 * one is skipped, never retried in a loop.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import type { Money } from '../money'
import type { TilePoint } from '../world/tileGrid'
import { defineOneProviderRegistry, entriesOf } from './seal'

/** One of the player's crates on the session's planet: where it stands and what empties it. */
export interface BotCrate {
  cell: TilePoint
  pickupIntent: CommandIntent
}

export interface BotCrateProvider {
  id: string
  /** The intent buying one more crate where the vehicle is docked; null where none is sold. */
  restockIntentOf(state: AuthorityState, playerId: string): CommandIntent | null
  /** What that intent costs, for the bot's wallet check. */
  restockCostOf(state: AuthorityState, playerId: string): Money
  /** The intent dropping the hold as a crate where the vehicle stands. */
  dropIntentOf(state: AuthorityState, playerId: string): CommandIntent
  /** The player's crates on the session's planet that hold cargo, oldest first. */
  cratesOf(state: AuthorityState, playerId: string): readonly BotCrate[]
}

export const BOT_CRATES_REGISTRY = defineOneProviderRegistry<BotCrateProvider>('botCrates')

/** The one provider, or null when no slice registers crates. */
export function botCrateProvider(): BotCrateProvider | null {
  const [provider] = entriesOf(BOT_CRATES_REGISTRY)
  return provider ?? null
}
