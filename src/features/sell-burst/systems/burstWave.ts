/**
 * One sale's part of the sell burst (#171 section 1, the lining beat of G&V on #176): its chunks,
 * its coins and the coins the lining bill peels off, and whether its net change lights the gold
 * flare. Money stays Money: the peel and the flare are Money compares (TD lock on #176).
 *
 * - Coins: the logged `coinsShown`, halved under reduced effects (`flashes: false`) and cut to the
 *   room the running burst has left.
 * - Peel: `max(1, round(coins · X / credits))` when a bill X was paid, so every coin peels when X
 *   is the whole proceeds. The rest land on the counter.
 * - Flare: on the net, `credits − X ≥ 10 × nextStepPrice`, because it promises a spree is ready.
 */
import type { SoldItem } from '../../../systems/authority/domainEvent'
import {
  cmp,
  div,
  fromSafeInteger,
  mul,
  roundToWhole,
  sub,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { BURST_TIMING, type BurstTiming } from './burstTiming'

/** A sale as the burst hears it: the gross credits, its coin count and the bill paid out of it. */
export interface BurstSale {
  items: readonly SoldItem[]
  credits: Money
  coinsShown: number
  /** X, the lining bill the sale paid; zero with no bill. */
  liningPaid: Money
  nextStepPrice: Money
}

/** 1 for one unit; 2 or 3 for a chunk that stands for several once a big haul collapses. */
export type ChunkSize = 1 | 2 | 3

export interface BurstChunk {
  tier: number
  size: ChunkSize
}

export interface BurstWave {
  startTick: number
  chunks: readonly BurstChunk[]
  coins: number
  peel: number
  credits: Money
  liningPaid: Money
  isFlare: boolean
}

/** What a burst still has room for, and whether effects are reduced. */
export interface WaveRoom {
  chunks: number
  coins: number
  isReduced: boolean
}

export function waveOfSale(
  sale: BurstSale,
  startTick: number,
  room: WaveRoom,
  timing: BurstTiming = BURST_TIMING,
): BurstWave {
  const coins = Math.min(room.coins, reducedCount(sale.coinsShown, room.isReduced, timing))
  return {
    startTick,
    chunks: chunksOfSale(sale.items, room.chunks),
    coins,
    peel: peelOf(coins, sale.liningPaid, sale.credits),
    credits: sale.credits,
    liningPaid: sale.liningPaid,
    isFlare: isFlareSale(sale, timing),
  }
}

/** The caps a fresh burst starts with: halved under reduced effects. */
export function freshRoom(isReduced: boolean, timing: BurstTiming = BURST_TIMING): WaveRoom {
  return {
    chunks: reducedCount(timing.chunks.max, isReduced, timing),
    coins: reducedCount(timing.coins.max, isReduced, timing),
    isReduced,
  }
}

/** The coins that leave the stream for the bill: none with no bill, at least one with one. */
export function peelOf(coins: number, liningPaid: Money, credits: Money): number {
  if (coins === 0 || !isBillPaid(liningPaid)) return 0
  const share = roundToWhole(div(mul(fromSafeInteger(coins), liningPaid), credits))
  return Math.min(coins, Math.max(1, toSafeInteger(share)))
}

/** The gold flare keys on the net change (G&V on #176): the bill is not spendable. */
export function isFlareSale(sale: BurstSale, timing: BurstTiming = BURST_TIMING): boolean {
  const net = sub(sale.credits, sale.liningPaid)
  const spree = mul(fromSafeInteger(timing.flare.stepMultiple), sale.nextStepPrice)
  return cmp(net, spree) >= 0
}

export function isBillPaid(liningPaid: Money): boolean {
  return cmp(liningPaid, ZERO_MONEY) > 0
}

/** The coins that land on the counter. */
export function landingCoinsOf(wave: BurstWave): number {
  return wave.coins - wave.peel
}

/** What the wave adds to the wallet: the credits less the bill. */
export function netOf(wave: BurstWave): Money {
  return sub(wave.credits, wave.liningPaid)
}

/**
 * One chunk per unit; past the room, the room's chunks share the units in order, each standing
 * for several, in mixed sizes (#171 section 1).
 */
export function chunksOfSale(items: readonly SoldItem[], room: number): BurstChunk[] {
  const units = items.reduce((total, item) => total + item.amount, 0)
  if (units <= room) return items.flatMap(unitChunksOf)
  return Array.from({ length: room }, (_, index) => collapsedChunkOf(items, index, units, room))
}

function unitChunksOf(item: SoldItem): BurstChunk[] {
  return Array.from({ length: item.amount }, () => ({ tier: item.tier, size: 1 }))
}

function collapsedChunkOf(
  items: readonly SoldItem[],
  index: number,
  units: number,
  room: number,
): BurstChunk {
  return {
    tier: tierOfUnit(items, Math.floor((index * units) / room)),
    size: index % 2 === 0 ? 2 : 3,
  }
}

/** The tier of the sale's `unit`-th unit, items in the order the sale lists them. */
function tierOfUnit(items: readonly SoldItem[], unit: number): number {
  let before = 0
  const owner = items.find((item) => {
    before += item.amount
    return unit < before
  })
  return (owner ?? items[items.length - 1]).tier
}

function reducedCount(count: number, isReduced: boolean, timing: BurstTiming): number {
  return isReduced ? Math.ceil(count / timing.reducedCountDivisor) : count
}
