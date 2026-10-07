/**
 * The sell burst's UI state (feature-slices.md 6.4: a slice keeps its UI state in its `store/`):
 * the running burst, and the tick the counter and the `Lining −X` tag were last read at. It hears
 * the local player's sales from the authority's events and never writes the game store or submits.
 *
 * The scene advances it once a frame with the authority tick, and it changes only when a coin
 * lands on the counter or the tag changes phase, so the counter re-renders per landing, never per
 * frame. What the counter shows is the pure `shownMoneyOf(wallet, burst, shownTick)`.
 */
import { create } from 'zustand'
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { nextStepPriceOf } from '../../../systems/authority/sellCoins'
import { rollMarkAt } from '../systems/counterRoll'
import { liningTagPhaseAt, type LiningTagPhase } from '../systems/liningTag'
import { hasSaleBy, salesOfBatch, type HeardSale } from '../systems/salesOfBatch'
import { burstWithSale, isBurstOverAt, type SellBurst } from '../systems/sellBurst'

interface SellBurstValues {
  burst: SellBurst | null
  /** The tick the counter and the tag were last read at. */
  shownTick: number
  /** How far the counter has rolled at `shownTick` (`rollMarkAt`): changes once per landing. */
  rollMark: number
  tagPhase: LiningTagPhase
}

interface SellBurstState extends SellBurstValues {
  /** A `listenForDomainEvents` listener: starts or merges a burst for each local sale. */
  hearSales(events: readonly DomainEvent[], playerId: string): void
  /** The frame's authority tick: lands coins, moves the tag and ends a finished burst. */
  advanceSellBurstTo(tick: number): void
}

const STARTING_VALUES: SellBurstValues = {
  burst: null,
  shownTick: 0,
  rollMark: 0,
  tagPhase: 'hidden',
}

export const useSellBurstStore = create<SellBurstState>()((set, get) => ({
  ...STARTING_VALUES,
  hearSales: (events, playerId) => {
    if (!hasSaleBy(events, playerId)) return
    const sales = salesOfBatch(events, playerId, nextStepPriceOf(readAuthorityState(), playerId))
    set(burstAfterSales(get().burst, sales, isEffectReduced()))
  },
  advanceSellBurstTo: (tick) => {
    const { burst } = get()
    if (burst === null) return
    if (isBurstStale(burst, tick)) set(STARTING_VALUES)
    else if (hasReadingMovedAt(get(), burst, tick)) set(readingAt(burst, tick))
  },
}))

/** For specs' `beforeEach`. */
export function resetSellBurstStore(): void {
  useSellBurstStore.setState(STARTING_VALUES)
}

function burstAfterSales(
  burst: SellBurst | null,
  sales: readonly HeardSale[],
  isReduced: boolean,
): Partial<SellBurstValues> {
  const heard = sales.reduce<SellBurst | null>(
    (running, { sale, tick }) => burstWithSale(running, sale, tick, isReduced),
    burst,
  )
  const tick = sales[sales.length - 1].tick
  return heard === null ? {} : readingAt(heard, tick)
}

/** Over, or from a later tick than now: a restored or restarted session's clock went back. */
function isBurstStale(burst: SellBurst, tick: number): boolean {
  return isBurstOverAt(burst, tick) || tick < burst.waves[0].startTick
}

function readingAt(burst: SellBurst, tick: number): SellBurstValues {
  return {
    burst,
    shownTick: tick,
    rollMark: rollMarkAt(burst, tick),
    tagPhase: liningTagPhaseAt(burst, tick),
  }
}

/** Read every frame, so it compares without building the reading. */
function hasReadingMovedAt(now: SellBurstValues, burst: SellBurst, tick: number): boolean {
  return rollMarkAt(burst, tick) !== now.rollMark || liningTagPhaseAt(burst, tick) !== now.tagPhase
}

/** Reduced effects are the flashes switch turned off (TD lock on #176): counts are halved. */
function isEffectReduced(): boolean {
  return !useGameStore.getState().prefs.flashes
}
