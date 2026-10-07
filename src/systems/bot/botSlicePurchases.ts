/**
 * The slices' purchases the pacing bot makes after the kernel's own (ticket 211): the first
 * registered `BotPurchase`, in id order, with a payload it calls available, that the wallet pays
 * with the next service kept back, and that the authority would accept. The bot never imports a
 * slice; with none registered it buys nothing here and reads no state.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { Money } from '../money'
import { botPurchases, type BotPurchase } from '../registries/botPurchases'
import { wouldAccept } from './botDryRun'
import type { BotSession } from './botSession'
import { canPay } from './botWallet'
import type { ShopSpend } from './shopSpend'

export interface SlicePurchasePick {
  purchase: BotPurchase
  intent: CommandIntent
  estimatedCost: Money
}

export function nextSlicePurchase(session: BotSession): SlicePurchasePick | null {
  for (const purchase of botPurchases()) {
    const pick = firstPayablePick(session, purchase)
    if (pick !== null) return pick
  }
  return null
}

/** Buys slice purchases while one pays; answers what each was estimated to cost. */
export function buySlicePurchases(session: BotSession): ShopSpend[] {
  const spends: ShopSpend[] = []
  for (let pick = nextSlicePurchase(session); pick !== null; pick = nextSlicePurchase(session)) {
    spends.push(spendOf(session, pick))
    session.submit(pick.intent)
  }
  return spends
}

function firstPayablePick(session: BotSession, purchase: BotPurchase): SlicePurchasePick | null {
  const { playerId } = session
  for (const args of purchase.payloadsToTry(session.state(), playerId)) {
    const pick = payablePickOf(session, purchase, args)
    if (pick !== null) return pick
  }
  return null
}

function payablePickOf(
  session: BotSession,
  purchase: BotPurchase,
  args: unknown,
): SlicePurchasePick | null {
  const state = session.state()
  if (!purchase.isAvailable(state, session.playerId, args)) return null
  const estimatedCost = purchase.estimateCost(state, session.playerId, args)
  const intent = { type: purchase.command, payload: args } as CommandIntent
  const isPayable = canPay(session, estimatedCost) && wouldAccept(session, intent)
  return isPayable ? { purchase, intent, estimatedCost } : null
}

function spendOf(session: BotSession, pick: SlicePurchasePick): ShopSpend {
  return {
    planetIndex: session.state().planet.index,
    source: 'slice',
    purchaseId: pick.purchase.id,
    cost: pick.estimatedCost,
  }
}
