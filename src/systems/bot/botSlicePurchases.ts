/**
 * The slices' purchases the pacing bot makes after the kernel's own (ticket 211): the first
 * registered `BotPurchase`, in id order, with a payload it calls available, that the wallet pays
 * with the next service kept back, and that the authority would accept. The bot never imports a
 * slice; with none registered it buys nothing here and reads no state.
 *
 * A purchase's due payloads (ticket 296, an extractor on its planet) come first instead, before
 * the kernel's own, and while one is due the bot saves for it (`isSavingForDuePurchase`).
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

/** Which of a purchase's payloads a pick is drawn from: all it would try, or its due ones. */
type PayloadsOf = (purchase: BotPurchase, session: BotSession) => readonly unknown[]

export function nextSlicePurchase(session: BotSession): SlicePurchasePick | null {
  return nextPickOf(session, payloadsToTryOf)
}

/** The first due payload the wallet pays, as `nextSlicePurchase` picks; null when none does. */
export function nextDueSlicePurchase(session: BotSession): SlicePurchasePick | null {
  return nextPickOf(session, duePayloadsOf)
}

/** Buys slice purchases while one pays; answers what each was estimated to cost. */
export function buySlicePurchases(session: BotSession): ShopSpend[] {
  return buyEachPick(session, nextSlicePurchase)
}

/** Buys the due payloads while one pays, before anything else at the bay (ticket 296). */
export function buyDueSlicePurchases(session: BotSession): ShopSpend[] {
  return buyEachPick(session, nextDueSlicePurchase)
}

/** A payload is still due: the bot keeps its money for it rather than spend it elsewhere. */
export function isSavingForDuePurchase(session: BotSession): boolean {
  return botPurchases().some((purchase) => duePayloadsOf(purchase, session).length > 0)
}

function buyEachPick(
  session: BotSession,
  nextPick: (session: BotSession) => SlicePurchasePick | null,
): ShopSpend[] {
  const spends: ShopSpend[] = []
  for (let pick = nextPick(session); pick !== null; pick = nextPick(session)) {
    spends.push(spendOf(session, pick))
    session.submit(pick.intent)
  }
  return spends
}

function nextPickOf(session: BotSession, payloadsOf: PayloadsOf): SlicePurchasePick | null {
  for (const purchase of botPurchases()) {
    const pick = firstPayablePick(session, purchase, payloadsOf(purchase, session))
    if (pick !== null) return pick
  }
  return null
}

function payloadsToTryOf(purchase: BotPurchase, session: BotSession): readonly unknown[] {
  return purchase.payloadsToTry(session.state(), session.playerId)
}

function duePayloadsOf(purchase: BotPurchase, session: BotSession): readonly unknown[] {
  return purchase.duePayloadsOf?.(session.state(), session.playerId) ?? []
}

function firstPayablePick(
  session: BotSession,
  purchase: BotPurchase,
  payloads: readonly unknown[],
): SlicePurchasePick | null {
  for (const args of payloads) {
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
  const { purchase, intent } = pick
  return {
    planetIndex: session.state().planet.index,
    source: 'slice',
    purchaseId: purchase.id,
    ...(purchase.boughtIdOf !== undefined && { boughtId: purchase.boughtIdOf(intent.payload) }),
    cost: pick.estimatedCost,
  }
}
