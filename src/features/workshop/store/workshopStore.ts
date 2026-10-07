/**
 * The Workshop's hold-to-buy controller and showcase state (#180 sections 1, 2 and 5; the TD's
 * `store/` chain controller): which plaque is selected, the live hold on G&V's curve, the tally
 * its plaque shows, the reaction each track's part is playing and the turntable's turn.
 *
 * The frames advance it with the authority tick; every due step is predicted on the replica, then
 * submitted as its own `buyUpgrade {upgradeId, chain}`, so a chain replays from its commands
 * alone and the curve never enters the authority. Reactions and sounds follow the authority's
 * answering `UpgradePurchased`, for a held step and a click alike; a `CommandRejected` naming the
 * live hold ends it on its cue. The UI reads authority state for pips and wallet, so nothing it
 * shows is ever rolled back.
 */
import { create } from 'zustand'
import { readAuthorityState, submitCommand } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { requestSoundCue } from '../../../store/soundCueRequests'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import { add, ZERO_MONEY, type Money } from '../../../systems/money'
import { stopCueOf, type ChainStopCue } from '../systems/chainCues'
import {
  chainOfNextStep,
  heardPurchasesOf,
  heardRefusalsOf,
  predictStep,
  type HeardPurchase,
  type PredictedStep,
} from '../systems/heldStep'
import {
  isChainLive,
  isStepDue,
  leaveHoldFocus,
  pressHoldChain,
  refuseStep,
  releaseHoldChain,
  type HoldChain,
} from '../systems/holdChain'
import { NO_MILESTONES } from '../systems/milestoneLandings'
import { cuePlaysOfStop, type CuePlay } from '../systems/render/purchaseSound'
import {
  RESTING_TURN,
  turnTowardTrack,
  type TurntableTurn,
} from '../systems/render/showcaseReactions'
import {
  heldAfterStep,
  reactionsAfterPurchases,
  soundsOfPurchases,
  type LiveHold,
  type StepReaction,
} from '../systems/liveHold'

/** What the plaque of the latest hold shows: "×N", its running total and how it ended. */
export type { LiveHold, StepReaction }

export interface ChainTally {
  upgradeId: UpgradeId
  steps: number
  spent: Money
  /** The stop cue once it ended; null while it runs. */
  cue: ChainStopCue | null
  endTick: number | null
}

interface WorkshopValues {
  selected: UpgradeId | null
  hold: LiveHold | null
  tally: ChainTally | null
  /** At most one per track: a new step restarts its track's reaction. */
  reactions: readonly StepReaction[]
  turn: TurntableTurn
  nextChainId: number
}

interface WorkshopState extends WorkshopValues {
  /** Lights the track's part and turns its face to the camera; never while a hold runs. */
  selectTrack(upgradeId: UpgradeId, tick: number): void
  /** A press on a plaque or part: buys one now and holds on the curve until let go. */
  pressTrack(upgradeId: UpgradeId, tick: number, stepLimit?: number | null): void
  releaseHold(): void
  /** The pointer, finger or focus left the track: its hold ends after the step in flight. */
  leaveTrack(upgradeId: UpgradeId): void
  /** The frame's authority tick: sends the hold's step if one is due. */
  advanceHoldTo(tick: number): void
  /** A `listenForDomainEvents` listener: reactions and sounds for every local purchase. */
  hearPurchases(events: readonly DomainEvent[], playerId: string): void
  /** The bay screen closed: a live hold is let go, and the turntable comes back to rest. */
  leaveShowcase(): void
}

/** The client restarts its hold ids at 1 each session (TD on #180). */
const FIRST_CHAIN_ID = 1

const STARTING_VALUES: WorkshopValues = {
  selected: null,
  hold: null,
  tally: null,
  reactions: [],
  turn: RESTING_TURN,
  nextChainId: FIRST_CHAIN_ID,
}

export const useWorkshopStore = create<WorkshopState>()((set, get) => ({
  ...STARTING_VALUES,
  selectTrack: (upgradeId, tick) => {
    if (isHoldLive(get().hold) || get().selected === upgradeId) return
    set({ selected: upgradeId, turn: turnTowardTrack(get().turn, upgradeId, tick) })
  },
  pressTrack: (upgradeId, tick, stepLimit = null) => {
    endLiveHold(leaveHoldFocus, tick)
    get().selectTrack(upgradeId, tick)
    set(pressedOn(get(), upgradeId, tick, stepLimit))
    get().advanceHoldTo(tick)
  },
  releaseHold: () => endLiveHold(releaseHoldChain, readTick()),
  leaveTrack: (upgradeId) => {
    if (get().hold?.upgradeId !== upgradeId) return
    endLiveHold(leaveHoldFocus, readTick())
  },
  advanceHoldTo: (tick) => {
    const { hold } = get()
    if (hold === null || !isStepDue(hold.chain, tick)) return
    sendHeldStep(hold, tick)
  },
  hearPurchases: (events, playerId) => {
    const purchases = heardPurchasesOf(events, playerId)
    if (purchases.length > 0) hearOwnPurchases(purchases)
    heardRefusalsOf(events, playerId).forEach(({ chain, reason }) =>
      endHoldOfChain(chain, (live) => refuseStep(live, reason)),
    )
  },
  leaveShowcase: () => {
    get().releaseHold()
    set({ selected: null, turn: RESTING_TURN, reactions: [] })
  },
}))

/** For specs' `beforeEach`. */
export function resetWorkshopStore(): void {
  useWorkshopStore.setState(STARTING_VALUES)
}

function isHoldLive(hold: LiveHold | null): hold is LiveHold {
  return hold !== null && isChainLive(hold.chain)
}

function readTick(): number {
  return readAuthorityState().tick
}

function localPlayerId(): string {
  return useGameStore.getState().playerId
}

function pressedOn(
  now: WorkshopValues,
  upgradeId: UpgradeId,
  tick: number,
  stepLimit: number | null,
): Partial<WorkshopValues> {
  const chainId = now.nextChainId
  const chain = pressHoldChain(tick)
  const hold = { upgradeId, chainId, chain, lastStepTick: null, lastGapTicks: null, stepLimit }
  const tally = { upgradeId, steps: 0, spent: ZERO_MONEY, cue: null, endTick: null }
  return { hold, tally, nextChainId: chainId + 1 }
}

/** Predict, keep the chain's answer, then submit: the answering events read the kept hold. */
function sendHeldStep(hold: LiveHold, tick: number): void {
  const step = predictHeldStep(hold)
  keepHeldStep(heldAfterStep(hold, step, tick), step)
  submitCommand(localPlayerId(), step.intent)
  endWhenChainStopped(tick)
}

function predictHeldStep(hold: LiveHold): PredictedStep {
  const chain = chainOfNextStep(hold.chain, hold.chainId)
  return predictStep(readAuthorityState(), localPlayerId(), hold.upgradeId, chain, NO_MILESTONES)
}

function keepHeldStep(hold: LiveHold, step: PredictedStep): void {
  const { tally } = useWorkshopStore.getState()
  if (tally === null || step.refusal !== null) return useWorkshopStore.setState({ hold })
  const counted = { ...tally, steps: tally.steps + 1, spent: add(tally.spent, step.price) }
  useWorkshopStore.setState({ hold, tally: counted })
}

/** A refused, milestone or `holdBuy`-limited step ended the chain in `heldAfterStep`. */
function endWhenChainStopped(tick: number): void {
  const { hold, tally } = useWorkshopStore.getState()
  if (hold === null || isChainLive(hold.chain) || tally?.cue !== null) return
  stopTally(hold.chain, tick)
}

function endLiveHold(end: (chain: HoldChain) => HoldChain, tick: number): void {
  const { hold } = useWorkshopStore.getState()
  if (!isHoldLive(hold)) return
  const ended = { ...hold, chain: end(hold.chain) }
  useWorkshopStore.setState({ hold: ended })
  stopTally(ended.chain, tick)
}

function endHoldOfChain(chainId: number, end: (chain: HoldChain) => HoldChain): void {
  if (useWorkshopStore.getState().hold?.chainId !== chainId) return
  endLiveHold(end, readTick())
}

/** The plaque's tally takes the stop cue, and the cadence plays. */
function stopTally(ended: HoldChain, tick: number): void {
  const { tally } = useWorkshopStore.getState()
  const cue = stopCueOf(ended)
  if (tally === null || cue === null) return
  useWorkshopStore.setState({ tally: { ...tally, cue, endTick: tick } })
  playCues(cuePlaysOfStop(cue))
}

function hearOwnPurchases(purchases: readonly HeardPurchase[]): void {
  const { reactions, hold } = useWorkshopStore.getState()
  useWorkshopStore.setState({ reactions: reactionsAfterPurchases(reactions, purchases, hold) })
  playCues(soundsOfPurchases(purchases, hold))
}

function playCues(plays: readonly CuePlay[]): void {
  plays.forEach(({ cueId, pitchSemitones, gain }) =>
    requestSoundCue(cueId, { pitchSemitones, gain }),
  )
}
