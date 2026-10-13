/**
 * The slices' purchases the pacing bot makes after the kernel's own (ticket 211): the first
 * registered `BotPurchase`, in id order, with a payload it calls available, that the wallet pays
 * with the next service kept back, and that the authority would accept. The bot never imports a
 * slice; with none registered it buys nothing here and reads no state.
 *
 * A purchase's due payloads (ticket 296, an extractor on its planet) come first instead, before
 * the kernel's own, and while one is due the bot saves for it (`isSavingForDuePurchase`).
 *
 * Whether a purchase makes the Upgrade bay worth the drive is asked at the Sell bay, where the
 * authority refuses the Upgrade bay's commands (`buyVehicleItem`: `wrong_bay`), so that question
 * skips the dry run and trusts the purchase's own `isAvailable` and the wallet; the buy at the bay
 * still dry-runs every pick. Asking the dry run there left the bot saving for a due extractor it
 * never drove over to buy (ticket 352: seeds 31415 and 27182 stalled on planet 5).
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

/** Whether the bot takes a pick: at the bay the authority must accept it, from afar it must pay. */
type PickTest = (session: BotSession, pick: SlicePurchasePick) => boolean

function nextSlicePurchase(session: BotSession): SlicePurchasePick | null {
  return nextPickOf(session, payloadsToTryOf, isAcceptedHere)
}

/** The first due payload the wallet pays, as `nextSlicePurchase` picks; null when none does. */
function nextDueSlicePurchase(session: BotSession): SlicePurchasePick | null {
  return nextPickOf(session, duePayloadsOf, isAcceptedHere)
}

/** A slice purchase the wallet pays, wherever the bot is docked: worth a drive to the bay. */
export function hasSlicePurchaseAtBay(session: BotSession): boolean {
  return nextPickOf(session, payloadsToTryOf, isPaidFor) !== null
}

/** A due payload the wallet pays, wherever the bot is docked: worth a drive to the bay. */
export function hasDueSlicePurchaseAtBay(session: BotSession): boolean {
  return nextPickOf(session, duePayloadsOf, isPaidFor) !== null
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

function nextPickOf(
  session: BotSession,
  payloadsOf: PayloadsOf,
  isTaken: PickTest,
): SlicePurchasePick | null {
  for (const purchase of botPurchases()) {
    const pick = firstTakenPick(session, purchase, payloadsOf(purchase, session), isTaken)
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

function firstTakenPick(
  session: BotSession,
  purchase: BotPurchase,
  payloads: readonly unknown[],
  isTaken: PickTest,
): SlicePurchasePick | null {
  for (const args of payloads) {
    const pick = availablePickOf(session, purchase, args)
    if (pick !== null && isTaken(session, pick)) return pick
  }
  return null
}

function availablePickOf(
  session: BotSession,
  purchase: BotPurchase,
  args: unknown,
): SlicePurchasePick | null {
  const state = session.state()
  if (!purchase.isAvailable(state, session.playerId, args)) return null
  const estimatedCost = purchase.estimateCost(state, session.playerId, args)
  const intent = { type: purchase.command, payload: args } as CommandIntent
  return { purchase, intent, estimatedCost }
}

function isPaidFor(session: BotSession, pick: SlicePurchasePick): boolean {
  return canPay(session, pick.estimatedCost)
}

function isAcceptedHere(session: BotSession, pick: SlicePurchasePick): boolean {
  return isPaidFor(session, pick) && wouldAccept(session, pick.intent)
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
