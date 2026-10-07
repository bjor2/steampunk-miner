/**
 * The running sell burst (#171 section 3 "Batching"): one burst per sale, and a second sale within
 * 1.5 s of the last merges into it as a new wave, adding chunks and coins up to the caps and
 * extending the timeline. A pure function of the tick, so it plays the same at any frame rate and
 * never touches the authority state, a snapshot or a digest.
 *
 * The beats that do not move with the tick (when the tag shows and fades, when the flare burns,
 * when it all ends) are scheduled once per sale, so a frame's reading only compares numbers.
 */
import { BURST_TIMING, firstCoinLandTick, peelLandTick } from './burstTiming'
import {
  freshRoom,
  isBillPaid,
  waveOfSale,
  type BurstSale,
  type BurstWave,
  type WaveRoom,
} from './burstWave'

export interface BurstSchedule {
  /** When the last coin lands, on the counter or the tag. */
  coinsDoneTick: number
  /** Null unless a wave's net reached ten steps; it burns once the last coin landed. */
  flareStartTick: number | null
  /** Null unless a wave paid a bill: the tag shows from the first peel. */
  tagStartTick: number | null
  /** 96 ticks after the last peeled coin lands. */
  tagFadeTick: number | null
  /** Every coin landed, the flare burnt out and the tag faded. */
  endTick: number
}

export interface SellBurst extends BurstSchedule {
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
  if (burst === null || !canMergeAt(burst, tick)) {
    return scheduledBurstOf([waveOfSale(sale, tick, freshRoom(isReduced))], isReduced)
  }
  const wave = waveOfSale(sale, tick, roomLeftIn(burst))
  return scheduledBurstOf([...burst.waves, wave], burst.isReduced)
}

/** Whether a sale at `tick` joins the running burst: within 1.5 s of its last sale. */
export function canMergeAt(burst: SellBurst, tick: number, timing = BURST_TIMING): boolean {
  return tick - lastWaveOf(burst.waves).startTick <= timing.mergeWindowTicks
}

export function isBurstOverAt(burst: SellBurst, tick: number): boolean {
  return tick >= burst.endTick
}

/** The first tick a coin of the wave reaches the counter. */
export function waveFirstLandTickOf(wave: BurstWave, timing = BURST_TIMING): number {
  return wave.startTick + firstCoinLandTick(timing)
}

function scheduledBurstOf(waves: readonly BurstWave[], isReduced: boolean): SellBurst {
  return { waves, isReduced, ...scheduleOf(waves) }
}

function scheduleOf(waves: readonly BurstWave[], timing = BURST_TIMING): BurstSchedule {
  const coinsDoneTick = lastWaveOf(waves).startTick + timing.coins.landTick
  const billed = waves.filter((wave) => isBillPaid(wave.liningPaid))
  const flareStartTick = waves.some((wave) => wave.isFlare) ? coinsDoneTick : null
  const tagFadeTick = billed.length === 0 ? null : tagFadeTickOf(lastWaveOf(billed))
  return {
    coinsDoneTick,
    flareStartTick,
    tagStartTick: billed.length === 0 ? null : billed[0].startTick + timing.lining.liningPeelTick,
    tagFadeTick,
    endTick: endTickOf(coinsDoneTick, flareStartTick, tagFadeTick),
  }
}

function endTickOf(
  coinsDoneTick: number,
  flareStartTick: number | null,
  tagFadeTick: number | null,
  timing = BURST_TIMING,
): number {
  const flareEnd = flareStartTick === null ? 0 : flareStartTick + timing.flare.ticks
  const tagEnd = tagFadeTick === null ? 0 : tagFadeTick + timing.lining.liningTagFadeTicks
  return Math.max(coinsDoneTick, flareEnd, tagEnd)
}

/** The tag holds 96 ticks after the last billed wave's peeled coins land. */
function tagFadeTickOf(lastBilled: BurstWave, timing = BURST_TIMING): number {
  return lastBilled.startTick + peelLandTick(timing) + timing.lining.liningTagHoldTicks
}

function roomLeftIn(burst: SellBurst): WaveRoom {
  const caps = freshRoom(burst.isReduced)
  return {
    chunks: caps.chunks - burst.waves.reduce((total, wave) => total + wave.chunks.length, 0),
    coins: caps.coins - burst.waves.reduce((total, wave) => total + wave.coins, 0),
    isReduced: burst.isReduced,
  }
}

function lastWaveOf(waves: readonly BurstWave[]): BurstWave {
  return waves[waves.length - 1]
}
