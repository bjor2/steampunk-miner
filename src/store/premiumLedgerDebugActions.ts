/**
 * The game store's premium ledger scenario call (ticket 844), kept beside the store so it stays
 * one reason to change: the setter submits `debug.setPremiumLedger`, so it replays and logs
 * `debug_command_applied` and throws when the authority refuses it; the read is never logged.
 */
import type { PremiumLedger } from '../systems/authority/premium/premiumLedger'
import { setPremiumLedgerCommand } from '../systems/authority/premium/premiumLedgerDebugRules'
import { premiumLedgerOf } from '../systems/authority/premium/premiumLedgerState'
import { readAuthorityState, submitUnlessRefused } from './authorityLink'

export interface PremiumLedgerDebugActions {
  /** Debug: the ledger replaced with `counts`, keyed `tier:s:p:speciesId`. */
  setPremiumLedger(counts: Readonly<Record<string, string>>): void
}

export function premiumLedgerDebugActionsOf(playerIdOf: () => string): PremiumLedgerDebugActions {
  return {
    setPremiumLedger: (counts) =>
      submitUnlessRefused(playerIdOf(), setPremiumLedgerCommand(counts)),
  }
}

/** The player's premium ledger counts as the authority holds them; never logged. */
export function readPremiumLedger(playerId: string): PremiumLedger {
  return premiumLedgerOf(readAuthorityState(), playerId)
}
