/**
 * The burst's sounds (#171 section 1 "Sound", TD lock on #176: existing voices only): one grouped
 * chunk clatter, the ticker's clacks, one per digit the sale rolls (at most 6), the coin cascade
 * as the coins land, rising with the coins shown, the low clank of the peeled coins reaching the
 * tag (G&V on #176) and the gold flare's bell. The cascade sounds at most every other tick, so the
 * voices stay at three plus the bell.
 *
 * Fired by tick crossings, so a frame plays what came due since the last one at any frame rate.
 */
import { cmp, fromSafeInteger, powInt, type Money } from '../../../systems/money'
import { BURST_TIMING, peelLandTick } from './burstTiming'
import { landingCoinsOf, type BurstWave } from './burstWave'
import { coinLandTickOf } from './counterRoll'
import type { SellBurst } from './sellBurst'

/** What plays each cue; the scene binds it to the shell's sound output once. */
export interface BurstCuePlayer {
  clatter(): void
  clack(): void
  /** The cascade's `note`-th step up the scale. */
  coin(note: number): void
  peel(): void
  bell(): void
}

/** The cascade starts a step higher for every ten coins shown. */
const COINS_PER_NOTE_STEP = 10
const TEN = fromSafeInteger(10)

/** Plays every cue due after `after`, up to and including `upTo`. */
export function playBurstCuesBetween(
  burst: SellBurst,
  after: number,
  upTo: number,
  player: BurstCuePlayer,
): void {
  for (let index = 0; index < burst.waves.length; index++) {
    playWaveCues(burst.waves[index], after, upTo, player)
  }
  if (isDue(burst.flareStartTick, after, upTo)) player.bell()
}

/** One clack per digit of the sale's whole credits, at most six (the ticker's six flaps). */
export function tickerClacksOf(credits: Money, timing = BURST_TIMING): number {
  let clacks = 1
  while (clacks < timing.ticker.maxClacks && cmp(credits, powInt(TEN, clacks)) >= 0) clacks += 1
  return clacks
}

function playWaveCues(wave: BurstWave, after: number, upTo: number, player: BurstCuePlayer): void {
  playChunkCues(wave, after, upTo, player)
  playCascade(wave, after, upTo, player)
  if (wave.peel > 0 && isDue(wave.startTick + peelLandTick(), after, upTo)) player.peel()
}

function playChunkCues(
  wave: BurstWave,
  after: number,
  upTo: number,
  player: BurstCuePlayer,
  timing = BURST_TIMING,
): void {
  if (wave.chunks.length === 0) return
  if (isDue(wave.startTick + timing.chunks.clatterTick, after, upTo)) player.clatter()
  const first = wave.startTick + timing.ticker.tick
  const last = first + (timing.ticker.maxClacks - 1) * timing.ticker.clackGapTicks
  // Counting the digits builds Money, so only the frames inside the clacks' window do it.
  if (upTo < first || after >= last) return
  const clacks = tickerClacksOf(wave.credits)
  for (let clack = 0; clack < clacks; clack++) {
    if (isDue(first + clack * timing.ticker.clackGapTicks, after, upTo)) player.clack()
  }
}

/** A note per landing coin, skipping any that lands within the gap of the last note. */
function playCascade(
  wave: BurstWave,
  after: number,
  upTo: number,
  player: BurstCuePlayer,
  timing = BURST_TIMING,
): void {
  const firstNote = Math.floor(wave.coins / COINS_PER_NOTE_STEP)
  let lastNoteTick = Number.NEGATIVE_INFINITY
  let note = firstNote
  for (let coin = 0; coin < landingCoinsOf(wave); coin++) {
    const land = coinLandTickOf(wave, coin)
    if (land - lastNoteTick < timing.coins.cascadeGapTicks) continue
    if (isDue(land, after, upTo)) player.coin(note)
    lastNoteTick = land
    note += 1
  }
}

function isDue(tick: number | null, after: number, upTo: number): boolean {
  return tick !== null && tick > after && tick <= upTo
}
