/**
 * The economy trace's asks (ticket 907): what the next useful upgrade costs and how long the
 * wallet takes to cover it. The useful upgrade is the cheapest next step of a track still short of
 * the planet's on-curve level (#6 section 3, the levels the pacing model plays each planet at);
 * once every track holds its level, the cheapest next step of any track. An ask opens on arrival
 * and after every track buy; it is covered on the first step the wallet holds its price, or
 * replaced when a buy opens the next one first, which says the money went elsewhere.
 */
import { nextUpgradePrice } from '../systems/authority/workshopRules'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { UPGRADE_IDS, type UpgradeId } from '../systems/economy/economyDefinition'
import { onCurveStep } from '../systems/economy/vehicleStats'
import { cmp, type Money } from '../systems/money'

export interface UpgradeAsk {
  openTick: number
  upgradeId: UpgradeId
  price: Money
  /** The first step the wallet held the price; null while it never has. */
  coveredTick: number | null
  /** The track buy that opened the next ask first; null while this one stands. */
  replacedTick: number | null
}

export function openUpgradeAsk(state: AuthorityState, playerId: string): UpgradeAsk {
  const { upgradeId, price } = nextUsefulUpgradeOf(state, playerId)
  const ask: UpgradeAsk = {
    openTick: state.tick,
    upgradeId,
    price,
    coveredTick: null,
    replacedTick: null,
  }
  return coverIfHeld(ask, state, playerId)
}

/** Covers the standing ask when the wallet holds it, and opens the next after a track buy. */
export function settleUpgradeAsks(
  asks: UpgradeAsk[],
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): void {
  const standing = asks[asks.length - 1]
  coverIfHeld(standing, state, playerId)
  if (!events.some(isTrackBuy)) return
  if (standing.coveredTick === null) standing.replacedTick = state.tick
  asks.push(openUpgradeAsk(state, playerId))
}

/** The ticks the ask waited: to its cover, else its replacement, else the planet's last step. */
export function askWaitTicks(ask: UpgradeAsk, lastTick: number): number {
  return (ask.coveredTick ?? ask.replacedTick ?? lastTick) - ask.openTick
}

export function nextUsefulUpgradeOf(
  state: AuthorityState,
  playerId: string,
): { upgradeId: UpgradeId; price: Money } {
  const short = UPGRADE_IDS.filter((track) => isShortOfCurve(state, playerId, track))
  const tracks = short.length > 0 ? short : UPGRADE_IDS
  return tracks
    .map((upgradeId) => ({ upgradeId, price: nextUpgradePrice(state, playerId, upgradeId) }))
    .reduce((cheapest, offer) => (cmp(offer.price, cheapest.price) < 0 ? offer : cheapest))
}

function isShortOfCurve(state: AuthorityState, playerId: string, track: UpgradeId): boolean {
  const step = state.players[playerId].vehicle.levels[track]
  return step < onCurveStep(track, state.planet.index)
}

function coverIfHeld(ask: UpgradeAsk, state: AuthorityState, playerId: string): UpgradeAsk {
  const isHeld = cmp(state.players[playerId].wallet, ask.price) >= 0
  if (ask.coveredTick === null && ask.replacedTick === null && isHeld) ask.coveredTick = state.tick
  return ask
}

function isTrackBuy(event: DomainEvent): boolean {
  return event.type === 'UpgradePurchased'
}
