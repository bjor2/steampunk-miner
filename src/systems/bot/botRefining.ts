/**
 * The pacing bot's refine policy (#105 design, "botShopping gets a simple policy"): back at the
 * Sell bay after a trip it first collects whatever is ready, freeing those slots; then, while the
 * platform has the Refinery bay, a slot is free and the bot will dive again, it drives to the
 * Refinery bay and queues its highest-value ore tier into every free slot (each up to half the
 * hold), and drives back to the Sell bay to sell the rest. Otherwise it just sells. Like every
 * buy of the bot (#29 note 3), a batch must leave the next service paid for: the wallet and the
 * rest of the haul still cover repair and recharge. It buys no slots: the policy is about the
 * refine or sell choice, and the slot track is left to players.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { serviceQuote } from '../authority/platformServices'
import { batchCapOf } from '../authority/refinery/refineryRules'
import { rawRefineValue } from '../economy/refineryEconomy'
import { add, cmp, sub } from '../money'
import { collectRefinedCommand, queueRefineCommand } from '../platform/platformCommands'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { wouldAccept } from './botDryRun'
import { driveToRefineryBay, driveToSellBay } from './botTrip'

/** Whether a run uses the refinery from its unlock planet, or plays as if it had none (#105 acc. 7). */
export type RefineryUse = 'used' | 'ignored'

/** Collects this bot's ready batches when it is docked at the Sell bay with any ready. */
export function collectWhenReady(session: BotSession): void {
  const collect = collectRefinedCommand()
  if (wouldAccept(session, collect)) session.submit(collect)
}

/** The refine stop of a dock cycle, for a bot that will dive again. */
export function refineWhenWorthIt(session: BotSession, planet: BotPlanet): void {
  const bay = planet.layout.refineryBay
  const batches = bay === null ? [] : plannedBatches(session)
  if (bay === null || batches.length === 0) return
  driveToRefineryBay(session, planet, bay)
  for (const batch of batches)
    submitWhenAccepted(session, queueRefineCommand(batch.tier, batch.units))
  driveToSellBay(session, planet)
}

interface PlannedBatch {
  tier: number
  units: number
}

/**
 * Highest tier first, one batch per free slot, each up to half the hold, while what is left of the
 * haul and the wallet still pays the repair and recharge after the trip.
 */
function plannedBatches(session: BotSession): PlannedBatch[] {
  const state = session.state()
  const quote = serviceQuote(state, session.playerId)
  const charges = add(quote.repairCost, quote.rechargeCost)
  const cap = batchCapOf(state, session.playerId)
  const freeSlots = state.platform.refinerySlots.filter((slot) => slot === null).length
  let paidIn = add(state.players[session.playerId].wallet, quote.saleValue)
  const batches: PlannedBatch[] = []
  for (const tier of heldTiersByValue(session).slice(0, freeSlots)) {
    const units = Math.min(session.vehicle().cargo.ore[String(tier)], cap)
    const left = sub(paidIn, rawRefineValue(tier, units))
    if (cmp(left, charges) < 0) break
    paidIn = left
    batches.push({ tier, units })
  }
  return batches
}

function submitWhenAccepted(session: BotSession, intent: CommandIntent): void {
  if (wouldAccept(session, intent)) session.submit(intent)
}

/** Ore value rises with the tier (#6 `V(t)`), so the highest tier is the most valuable. */
function heldTiersByValue(session: BotSession): number[] {
  return Object.entries(session.vehicle().cargo.ore)
    .filter(([, units]) => units > 0)
    .map(([tier]) => Number.parseInt(tier, 10))
    .sort((a, b) => b - a)
}
