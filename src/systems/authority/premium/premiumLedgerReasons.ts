/**
 * The words an `ore_premium_ledger` line says (ticket 844), a leaf the run-log schema reads
 * without the authority's graph.
 */

/** How a premium ledger count changed: mined in, debited, or moved with its units. */
export const PREMIUM_LEDGER_CHANGES = ['collect', 'debit', 'move'] as const
export type PremiumLedgerChange = (typeof PREMIUM_LEDGER_CHANGES)[number]

/**
 * Why: `mined` into the hold; the units `sold`, `lost` to a tow, `refined` or `jettisoned`; moved
 * into a placed container or back out of one.
 */
export const PREMIUM_LEDGER_REASONS = [
  'mined',
  'sold',
  'lost',
  'refined',
  'jettisoned',
  'container_drop',
  'container_pickup',
] as const
export type PremiumLedgerReason = (typeof PREMIUM_LEDGER_REASONS)[number]
