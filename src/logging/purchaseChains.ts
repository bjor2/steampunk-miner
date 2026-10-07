/**
 * Hold-to-buy chains, derived from a run's events (ticket 226; the TD on #180: chains are derived
 * from the purchase lines, never logged as their own; #11: derived data stays derived). A chain is
 * the held purchase lines one player logged in a row with one `chain` id on one row of the Upgrade
 * bay. It ends at that player's next purchase line of another hold, row or a click, or at a
 * `command_rejected` naming its chain, whose reason is its `stoppedBy`. A chain that ends any other
 * way was released or lost focus, which only the client sees.
 */
import { add, fromCanonical, toCanonical, ZERO_MONEY, type Money } from '../systems/money'
import type { RunEventName } from './eventNames'
import type { HeldStepFields } from './purchaseStepLine'
import type { RunEvent } from './runEvent'

/** The `stoppedBy` of a chain no refusal ended: the player let go, or focus left the plaque. */
export const RELEASED_OR_FOCUS = 'release_or_focus'

/** The rows that are not upgrade tracks, by their schedule row ids (#107, #109) and the casing. */
const GUNS_ROW = 'auto_guns'
const RACK_ROW = 'blasting_charges'
const CASING_ROW = 'casing'

export interface PurchaseChain {
  playerId: string
  /** The row held: an upgrade track, `auto_guns`, `blasting_charges` (the rack) or `casing`. */
  track: string
  chain: number
  steps: number
  fromLevel: number
  toLevel: number
  /** What the steps cost together, as a canonical string. */
  cost: string
  /** The wallet above the service reserve after the last step. */
  reserveLeft: string
  /** The refusal that ended the chain, or `release_or_focus`. */
  stoppedBy: string
  firstTick: number
  lastTick: number
}

/** The same derivation one event at a time, for the live run summary (#117). */
export interface PurchaseChainFold {
  add(event: RunEvent): void
  /** The chains so far; one still open counts as released. */
  chains(): PurchaseChain[]
}

export function derivePurchaseChains(events: readonly RunEvent[]): PurchaseChain[] {
  const fold = startPurchaseChainFold()
  for (const event of events) fold.add(event)
  return fold.chains()
}

export function startPurchaseChainFold(): PurchaseChainFold {
  const tally: ChainTally = { chains: [], open: new Map() }
  return {
    add: (event) => foldChainEvent(tally, event),
    chains: () => tally.chains.map(purchaseChainOf),
  }
}

/** One bought step as its line tells it. */
interface PurchaseStep extends HeldStepFields {
  track: string
  fromLevel: number
  toLevel: number
  cost: string
}

interface OpenChain {
  playerId: string
  track: string
  chain: number
  steps: number
  fromLevel: number
  toLevel: number
  cost: Money
  reserveLeft: string
  stoppedBy: string | null
  firstTick: number
  lastTick: number
}

interface ChainTally {
  chains: OpenChain[]
  /** Each player's chain still taking steps. */
  open: Map<string, OpenChain>
}

type ChainFold<N extends RunEventName> = (tally: ChainTally, event: RunEvent<N>) => void

/** One fold step per line a chain reads, as in `deriveSummary`. */
const CHAIN_FOLDS: { readonly [N in RunEventName]?: ChainFold<N> } = {
  upgrade_purchased: (tally, event) => foldStep(tally, event, upgradeStepOf(event.data)),
  gun_mounted: (tally, event) => foldStep(tally, event, mountStepOf(event.data)),
  gun_upgraded: (tally, event) =>
    foldStep(tally, event, { track: GUNS_ROW, ...stepped(event.data) }),
  charge_rack_upgraded: (tally, event) =>
    foldStep(tally, event, { track: RACK_ROW, ...stepped(event.data) }),
  casing_upgraded: (tally, event) =>
    foldStep(tally, event, { track: CASING_ROW, ...stepped(event.data) }),
  command_rejected: stopRefusedChain,
}

function foldChainEvent(tally: ChainTally, event: RunEvent): void {
  CHAIN_FOLDS[event.event]?.(tally, event as never)
}

function upgradeStepOf(data: RunEvent<'upgrade_purchased'>['data']): PurchaseStep {
  const { upgradeId, fromLevel, toLevel, cost, chain, reserveLeft } = data
  return { track: upgradeId, fromLevel, toLevel, cost, chain, reserveLeft }
}

/** The mount lands the guns' first major from none (#180). */
function mountStepOf(data: RunEvent<'gun_mounted'>['data']): PurchaseStep {
  return { track: GUNS_ROW, fromLevel: 0, toLevel: data.level, ...paid(data) }
}

function paid(data: HeldStepFields & { price: string }): HeldStepFields & { cost: string } {
  return { cost: data.price, chain: data.chain, reserveLeft: data.reserveLeft }
}

function stepped(data: HeldStepFields & { from: number; to: number; price: string }) {
  return { fromLevel: data.from, toLevel: data.to, ...paid(data) }
}

function foldStep(tally: ChainTally, event: RunEvent, step: PurchaseStep): void {
  const open = tally.open.get(event.playerId)
  if (open !== undefined && isNextStepOf(open, step)) {
    extendChain(open, step, event.tick)
    return
  }
  if (open !== undefined) closeChain(tally, open, RELEASED_OR_FOCUS)
  if (step.chain !== undefined) openChain(tally, event, step, step.chain)
}

function isNextStepOf(open: OpenChain, step: PurchaseStep): boolean {
  return open.chain === step.chain && open.track === step.track
}

function openChain(tally: ChainTally, event: RunEvent, step: PurchaseStep, id: number): void {
  const chain: OpenChain = {
    playerId: event.playerId,
    track: step.track,
    chain: id,
    steps: 0,
    fromLevel: step.fromLevel,
    toLevel: step.fromLevel,
    cost: ZERO_MONEY,
    reserveLeft: '0e+0',
    stoppedBy: null,
    firstTick: event.tick,
    lastTick: event.tick,
  }
  tally.chains.push(chain)
  tally.open.set(event.playerId, chain)
  extendChain(chain, step, event.tick)
}

function extendChain(open: OpenChain, step: PurchaseStep, tick: number): void {
  open.steps += 1
  open.toLevel = step.toLevel
  open.cost = add(open.cost, fromCanonical(step.cost))
  open.reserveLeft = step.reserveLeft ?? open.reserveLeft
  open.lastTick = tick
}

function stopRefusedChain(tally: ChainTally, refusal: RunEvent<'command_rejected'>): void {
  const open = tally.open.get(refusal.playerId)
  if (open !== undefined && open.chain === refusal.data.chain) {
    closeChain(tally, open, refusal.data.reason)
  }
}

function closeChain(tally: ChainTally, open: OpenChain, stoppedBy: string): void {
  open.stoppedBy = stoppedBy
  tally.open.delete(open.playerId)
}

function purchaseChainOf(open: OpenChain): PurchaseChain {
  return {
    ...open,
    cost: toCanonical(open.cost),
    stoppedBy: open.stoppedBy ?? RELEASED_OR_FOCUS,
  }
}
