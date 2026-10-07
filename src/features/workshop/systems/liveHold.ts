/**
 * The live hold the Workshop's controller runs (#180 section 2): what one sent step does to it,
 * and what the authority's answering purchases play on the car and in the ratchet. A purchase of
 * the live hold reads the hold's curve (its row, its gap, whether it is still live); any other,
 * the press and keyboard or controller clicks included, plays as a click.
 */
import { CLICK_CHAIN } from '../../../systems/authority/purchaseChain'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import { pipOf } from '../../../systems/economy/upgradeSteps'
import { clickMomentOf, momentOf, type StepMoment } from './chainCues'
import type { HeardPurchase, PredictedStep } from './heldStep'
import { HOLD_CURVE, landStep, refuseStep, releaseHoldChain, type HoldChain } from './holdChain'
import { landingOf, NO_MILESTONES, type MilestoneMajor } from './milestoneLandings'
import { cuePlaysOfStep, type CuePlay, type HeardStep } from './render/purchaseSound'

export interface LiveHold {
  upgradeId: UpgradeId
  /** The hold's id, which every step after the press carries. */
  chainId: number
  chain: HoldChain
  /** The tick the last step was sent, and the gap to the one before (null after the press). */
  lastStepTick: number | null
  lastGapTicks: number | null
  /** `holdBuy`'s release: let go once this many steps landed; null for a player's hold. */
  stepLimit: number | null
}

/** The reaction a track's part is playing, from the tick its step landed. */
export interface StepReaction {
  upgradeId: UpgradeId
  moment: StepMoment
  startTick: number
}

/**
 * The hold after one sent step: landed on the curve, or ended by the predicted refusal. The curve
 * counts from the tick the step was due, not the frame that sent it, so a 30 Hz frame rate sends
 * a step at most a tick late and never drifts the chain.
 */
export function heldAfterStep(hold: LiveHold, step: PredictedStep, tick: number): LiveHold {
  if (step.refusal !== null) return { ...hold, chain: refuseStep(hold.chain, step.refusal) }
  const dueTick = hold.chain.nextStepTick ?? tick
  const landed = landStep(hold.chain, dueTick, step.landing)
  const lastGapTicks = hold.lastStepTick === null ? null : dueTick - hold.lastStepTick
  const chain = isAtStepLimit(landed, hold.stepLimit) ? releaseHoldChain(landed) : landed
  return { ...hold, chain, lastStepTick: dueTick, lastGapTicks }
}

/** Each purchase restarts its own track's reaction; the other tracks play on. */
export function reactionsAfterPurchases(
  reactions: readonly StepReaction[],
  purchases: readonly HeardPurchase[],
  hold: LiveHold | null,
  milestones: readonly MilestoneMajor[] = NO_MILESTONES,
): StepReaction[] {
  return purchases.reduce<StepReaction[]>(
    (playing, purchase) => [
      ...playing.filter((reaction) => reaction.upgradeId !== purchase.upgradeId),
      reactionOf(purchase, hold, milestones),
    ],
    [...reactions],
  )
}

/** What the purchases play: a pip's ratchet layers, a big level-up's flourish. */
export function soundsOfPurchases(
  purchases: readonly HeardPurchase[],
  hold: LiveHold | null,
  milestones: readonly MilestoneMajor[] = NO_MILESTONES,
): CuePlay[] {
  return purchases.flatMap((purchase) => cuePlaysOfStep(heardStepOf(purchase, hold, milestones)))
}

function isAtStepLimit(chain: HoldChain, stepLimit: number | null): boolean {
  return stepLimit !== null && chain.steps >= stepLimit
}

function reactionOf(
  purchase: HeardPurchase,
  hold: LiveHold | null,
  milestones: readonly MilestoneMajor[],
): StepReaction {
  const moment = momentOfPurchase(purchase, hold, milestones)
  return { upgradeId: purchase.upgradeId, moment, startTick: purchase.tick }
}

function heardStepOf(
  purchase: HeardPurchase,
  hold: LiveHold | null,
  milestones: readonly MilestoneMajor[],
): HeardStep {
  const held = holdOfPurchase(purchase, hold)
  return {
    moment: momentOfPurchase(purchase, hold, milestones),
    pip: pipOf(purchase.fromStep),
    gapTicks: held?.lastGapTicks ?? null,
    onRow: held?.chain.onRow ?? 0,
    rowCount: HOLD_CURVE.gapTicks.length,
  }
}

function momentOfPurchase(
  purchase: HeardPurchase,
  hold: LiveHold | null,
  milestones: readonly MilestoneMajor[],
): StepMoment {
  const landing = landingOf(purchase.upgradeId, purchase.fromStep, milestones)
  const held = holdOfPurchase(purchase, hold)
  return held === null ? clickMomentOf(landing) : momentOf(landing, held.chain)
}

/** The live hold this purchase is a held step of; null for a click. */
function holdOfPurchase(purchase: HeardPurchase, hold: LiveHold | null): LiveHold | null {
  if (hold === null || purchase.chain === CLICK_CHAIN) return null
  return purchase.chain === hold.chainId ? hold : null
}
