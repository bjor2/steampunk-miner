/**
 * The running sell burst (#171 section 3 "Batching"): one burst per sale, and a second sale within
 * 1.5 s of the last merges into it as a new wave, adding chunks and coins up to the caps and
 * extending the timeline. A pure function of the tick, so it plays the same at any frame rate and
 * never touches the authority state, a snapshot or a digest.
 */
import { BURST_TIMING, firstCoinLandTick, peelLandTick, type BurstTiming } from './burstTiming'
import {
  freshRoom,
  isBillPaid,
  waveOfSale,
  type BurstSale,
  type BurstWave,
  type WaveRoom,
} from './burstWave'

export interface SellBurst {
  waves: readonly BurstWave[]
  isReduced: boolean
}

/** A new burst, or the sale merged into the running one when it came within the merge window. */
export function burstWithSale(
  burst: SellBurst | null,
  sale: BurstSale,
  tick: number,
  isReduced: boolean,
): SellBurst {
  if (burst === null || !canMergeAt(burst, tick)) return freshBurstOf(sale, tick, isReduced)
  const wave = waveOfSale(sale, tick, roomLeftIn(burst))
  return { ...burst, waves: [...burst.waves, wave] }
}

/** Whether a sale at `tick` joins the running burst: within 1.5 s of its last sale. */
export function canMergeAt(burst: SellBurst, tick: number, timing = BURST_TIMING): boolean {
  return tick - lastWaveOf(burst).startTick <= timing.mergeWindowTicks
}

/** Once every coin landed, the flare burnt out and the lining tag faded. */
export function isBurstOverAt(burst: SellBurst, tick: number): boolean {
  return tick >= burstEndTickOf(burst)
}

export function burstEndTickOf(burst: SellBurst, timing: BurstTiming = BURST_TIMING): number {
  return Math.max(
    coinsDoneTickOf(burst, timing),
    flareEndTickOf(burst, timing),
    tagEndTickOf(burst),
  )
}

/** The tick the last coin of the burst lands, on the counter or the tag. */
export function coinsDoneTickOf(burst: SellBurst, timing: BurstTiming = BURST_TIMING): number {
  return lastWaveOf(burst).startTick + timing.coins.landTick
}

/** The flare burns after the last coin lands, once a wave's net reached ten steps; else never. */
export function flareStartTickOf(burst: SellBurst, timing = BURST_TIMING): number | null {
  return burst.waves.some((wave) => wave.isFlare) ? coinsDoneTickOf(burst, timing) : null
}

/** The tick the tag first shows, or null when no wave paid a bill. */
export function tagStartTickOf(burst: SellBurst, timing = BURST_TIMING): number | null {
  const billed = burst.waves.find((wave) => isBillPaid(wave.liningPaid))
  return billed === undefined ? null : billed.startTick + timing.lining.liningPeelTick
}

/** The tag holds 96 ticks after the last peeled coin lands, then fades over 12. */
export function tagFadeTickOf(burst: SellBurst, timing = BURST_TIMING): number | null {
  const billed = burst.waves.filter((wave) => isBillPaid(wave.liningPaid))
  if (billed.length === 0) return null
  const lastPeelLand = billed[billed.length - 1].startTick + peelLandTick(timing)
  return lastPeelLand + timing.lining.liningTagHoldTicks
}

/** The first tick a coin of the wave reaches the counter. */
export function waveFirstLandTickOf(wave: BurstWave, timing = BURST_TIMING): number {
  return wave.startTick + firstCoinLandTick(timing)
}

function freshBurstOf(sale: BurstSale, tick: number, isReduced: boolean): SellBurst {
  return { waves: [waveOfSale(sale, tick, freshRoom(isReduced))], isReduced }
}

function roomLeftIn(burst: SellBurst): WaveRoom {
  const caps = freshRoom(burst.isReduced)
  return {
    chunks: caps.chunks - burst.waves.reduce((total, wave) => total + wave.chunks.length, 0),
    coins: caps.coins - burst.waves.reduce((total, wave) => total + wave.coins, 0),
    isReduced: burst.isReduced,
  }
}

function lastWaveOf(burst: SellBurst): BurstWave {
  return burst.waves[burst.waves.length - 1]
}

function flareEndTickOf(burst: SellBurst, timing: BurstTiming): number {
  const start = flareStartTickOf(burst, timing)
  return start === null ? 0 : start + timing.flare.ticks
}

function tagEndTickOf(burst: SellBurst, timing = BURST_TIMING): number {
  const fade = tagFadeTickOf(burst, timing)
  return fade === null ? 0 : fade + timing.lining.liningTagFadeTicks
}
