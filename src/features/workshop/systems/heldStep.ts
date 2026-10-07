/**
 * One step of a hold, as the client predicts it before submitting (#180 section 2 "Authority",
 * the TD's anti-lag rule): the `buyUpgrade` it sends, what it lands as, and the refusal the
 * authority would give, from a dry run of the authority's own rule on the replica. In single
 * player the prediction is exact; in co-op a refusal the prediction missed still ends the chain
 * when its `CommandRejected` comes back, and the UI shows authority state only, so no pip reverts.
 *
 * The press is a click (`chain` 0), so it may spend into the service reserve like any click; the
 * steps from the wind-up on carry the hold's id and keep the reserve (G&V: "a single click can").
 */
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { refusalOfIntent } from '../../../systems/authority/applyCommand'
import type { DomainEvent, RejectionReason } from '../../../systems/authority/domainEvent'
import { CLICK_CHAIN } from '../../../systems/authority/purchaseChain'
import { nextUpgradePrice } from '../../../systems/authority/workshopRules'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import type { Money } from '../../../systems/money'
import { isUpgradeId } from '../../../systems/vehicle/vehicleStats'
import { buyUpgradeCommand } from '../../../systems/platform/platformCommands'
import type { HoldChain, StepLanding } from './holdChain'
import { landingOf, type MilestoneMajor } from './milestoneLandings'

export interface PredictedStep {
  intent: CommandIntent<'buyUpgrade'>
  landing: StepLanding
  /** Why the authority will refuse it; null when it lands. */
  refusal: RejectionReason | null
  /** What it costs if it lands. */
  price: Money
}

/** A bought step the local player's events report, with the hold it belonged to (0 a click). */
export interface HeardPurchase {
  upgradeId: UpgradeId
  fromStep: number
  chain: number
  tick: number
}

/** A held step the authority refused. */
export interface HeardRefusal {
  chain: number
  reason: RejectionReason
}

/** The `chain` the next step of this hold carries: 0 for its press, the hold's id after. */
export function chainOfNextStep(chain: HoldChain, chainId: number): number {
  return chain.steps === 0 ? CLICK_CHAIN : chainId
}

export function predictStep(
  state: AuthorityState,
  playerId: string,
  upgradeId: UpgradeId,
  chain: number,
  milestones?: readonly MilestoneMajor[],
): PredictedStep {
  const intent = buyUpgradeCommand(upgradeId, chain)
  const fromStep = state.players[playerId].vehicle.levels[upgradeId]
  const refusal = refusalOfIntent(state, playerId, intent)?.reason ?? null
  const price = nextUpgradePrice(state, playerId, upgradeId)
  return { intent, landing: landingOf(upgradeId, fromStep, milestones), refusal, price }
}

type Purchased = Extract<DomainEvent, { type: 'UpgradePurchased' }>
type Rejected = Extract<DomainEvent, { type: 'CommandRejected' }>

/** The local player's track purchases in a batch of authority events. */
export function heardPurchasesOf(
  events: readonly DomainEvent[],
  playerId: string,
): HeardPurchase[] {
  return events
    .filter((event): event is Purchased => isTrackPurchaseBy(event, playerId))
    .map((event) => ({
      upgradeId: event.upgradeId as UpgradeId,
      fromStep: event.fromLevel,
      chain: event.chain,
      tick: event.tick,
    }))
}

/** The local player's refused held steps in a batch; a click's refusal names no hold. */
export function heardRefusalsOf(events: readonly DomainEvent[], playerId: string): HeardRefusal[] {
  return events
    .filter((event): event is Rejected => isHeldRefusalOf(event, playerId))
    .map((event) => ({ chain: event.chain ?? CLICK_CHAIN, reason: event.reason }))
}

function isTrackPurchaseBy(event: DomainEvent, playerId: string): boolean {
  if (event.type !== 'UpgradePurchased' || event.playerId !== playerId) return false
  return isUpgradeId(event.upgradeId)
}

function isHeldRefusalOf(event: DomainEvent, playerId: string): boolean {
  return (
    event.type === 'CommandRejected' && event.playerId === playerId && event.chain !== undefined
  )
}
