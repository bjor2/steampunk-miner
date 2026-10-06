/**
 * The pacing bot's refine policy (#105 design, "botShopping gets a simple policy"): back at the
 * Sell bay after a trip it first collects whatever is ready, freeing those slots; then, while the
 * platform has the Refinery bay, a slot is free and the bot will dive again, it drives to the
 * Refinery bay and queues its highest-value ore tier into every free slot (each up to half the
 * hold), and drives back to the Sell bay to sell the rest. Otherwise it just sells. It buys no slots: the policy is about the refine or
 * sell choice, and the slot track is left to players.
 */
import { batchCapOf } from '../authority/refinery/refineryRules'
import { freeSlotIndex } from '../authority/refinery/refineryBatch'
import { collectRefinedCommand, queueRefineCommand } from '../platform/platformCommands'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { wouldAccept } from './botShopping'
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
  if (bay === null || !hasHaulToRefine(session)) return
  driveToRefineryBay(session, planet, bay)
  queueBestTiers(session)
  driveToSellBay(session, planet)
}

function hasHaulToRefine(session: BotSession): boolean {
  const hasFreeSlot = freeSlotIndex(session.state().platform.refinerySlots) !== null
  return hasFreeSlot && heldTiersByValue(session).length > 0
}

/** Highest tier first, one batch per free slot, while the hold has ore and a slot is free. */
function queueBestTiers(session: BotSession): void {
  for (const tier of heldTiersByValue(session)) {
    const intent = queueRefineCommand(tier, batchCapOf(session.state(), session.playerId))
    if (!wouldAccept(session, intent)) return
    session.submit(intent)
  }
}

/** Ore value rises with the tier (#6 `V(t)`), so the highest tier is the most valuable. */
function heldTiersByValue(session: BotSession): number[] {
  return Object.entries(session.vehicle().cargo.ore)
    .filter(([, units]) => units > 0)
    .map(([tier]) => Number.parseInt(tier, 10))
    .sort((a, b) => b - a)
}
