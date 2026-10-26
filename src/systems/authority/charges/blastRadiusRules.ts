/**
 * The Blast Radius track (D9 #869; Bjor 04:51 via Grok Bot, the D6 rows on #865): a level line
 * under `blasting_charges`, money only, uncapped, with no planet gate and no stats id.
 *
 * - `BuyBlastRadiusLevel {chain}`: at the Upgrade bay, the planter's level goes up one for
 *   `blastRadiusLevelPrice(L, p)`. Refused `money_short` when the wallet cannot pay and, for a held
 *   step, `service_reserve` (`purchaseChain.ts`); a refused command changes nothing. Logs
 *   `blast_radius_upgraded`, stamped with its chain.
 * - `debug.setBlastRadiusLevel {level}`: a scenario's level, no price.
 *
 * The level is the rig's, never a charge's: every blast reads the level owned when it blows
 * (`chargeDetonation.ts`), so stock bought earlier is never stranded, and no charge is repriced.
 */
import { blastRadiusLevelPrice } from '../../economy/blastingCharges'
import { sub, toCanonical, type Money } from '../../money'
import { blastRadiusLevelOf, withBlastRadiusLevel } from '../../vehicle/vehicleCharges'
import { withWallet, type AuthorityState } from '../authorityState'
import { firstRejection, type CommandRule, type Rejection, type RuleEffect } from '../commandRule'
import { atBayRejection } from '../dockRules'
import { moneyShortRejection } from '../platformServices'
import { chainStampOf, serviceReserveRejection } from '../purchaseChain'
import { chargesOf, withCharges } from './chargeRules'

export const BLAST_RADIUS_RULES: {
  readonly buyBlastRadiusLevel: CommandRule<'buyBlastRadiusLevel'>
} = {
  buyBlastRadiusLevel: {
    fields: { chain: 'wholeNumber' },
    reject: (state, { playerId, payload }) => blastRadiusRefusal(state, playerId, payload.chain),
    apply: (state, { playerId, payload }) => buyBlastRadiusLevel(state, playerId, payload.chain),
  },
}

export const BLAST_RADIUS_DEBUG_RULES: {
  readonly 'debug.setBlastRadiusLevel': CommandRule<'debug.setBlastRadiusLevel'>
} = {
  'debug.setBlastRadiusLevel': {
    fields: { level: 'wholeNumber' },
    reject: () => null,
    apply: (state, { playerId, payload }) => ({
      state: atBlastRadiusLevel(state, playerId, payload.level),
      events: [],
    }),
  },
}

/**
 * Why a Blast Radius level buy in `chain` would be refused now; null when it would add one. The
 * track has no top, so nothing but the bay and the wallet refuses it.
 */
export function blastRadiusRefusal(
  state: AuthorityState,
  playerId: string,
  chain: number,
): Rejection | null {
  const price = blastRadiusPriceOf(state, playerId)
  return firstRejection([
    () => atBayRejection(state, playerId, 'upgrade'),
    () => moneyShortRejection(state.players[playerId].wallet, price),
    () => serviceReserveRejection(state, playerId, chain, price),
  ])
}

/** What the planter's next Blast Radius level costs on this planet. */
export function blastRadiusPriceOf(state: AuthorityState, playerId: string): Money {
  return blastRadiusLevelPrice(blastRadiusLevelOf(chargesOf(state, playerId)), state.planet.index)
}

function buyBlastRadiusLevel(state: AuthorityState, playerId: string, chain: number): RuleEffect {
  const price = blastRadiusPriceOf(state, playerId)
  const from = blastRadiusLevelOf(chargesOf(state, playerId))
  const raised = atBlastRadiusLevel(state, playerId, from + 1)
  const after = withWallet(raised, playerId, sub(state.players[playerId].wallet, price))
  const purchase = { from, to: from + 1, price: toCanonical(price) }
  return {
    state: after,
    events: [{ type: 'BlastRadiusUpgraded', ...purchase, ...chainStampOf(after, playerId, chain) }],
  }
}

function atBlastRadiusLevel(
  state: AuthorityState,
  playerId: string,
  level: number,
): AuthorityState {
  return withCharges(state, playerId, withBlastRadiusLevel(chargesOf(state, playerId), level))
}
