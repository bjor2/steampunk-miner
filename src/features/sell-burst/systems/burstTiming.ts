/**
 * The sell burst's beats and caps (#171 section 3, the lining beat of G&V on #176), read from
 * `sellBurst.json`, whose values G&V owns. Ticks are 60 Hz and count from the sale that started a
 * wave of the burst.
 */
import BURST_FILE from '../sellBurst.json'

export interface BurstTiming {
  chunks: {
    max: number
    launchSpreadTicks: number
    flightTicks: number
    arcLowM: number
    arcHighM: number
    clatterTick: number
  }
  ticker: { tick: number; clackGapTicks: number; maxClacks: number }
  coins: {
    max: number
    burstTick: number
    burstSpreadTicks: number
    riseTicks: number
    riseM: number
    hangTick: number
    flightTicks: number
    landTick: number
    cascadeGapTicks: number
  }
  lining: { liningPeelTick: number; liningTagHoldTicks: number; liningTagFadeTicks: number }
  flare: { stepMultiple: number; ticks: number }
  mergeWindowTicks: number
  reducedCountDivisor: number
}

export const BURST_TIMING: BurstTiming = BURST_FILE

/** When the coins that reach the counter start landing: the stream's first arrival. */
export function firstCoinLandTick(timing: BurstTiming = BURST_TIMING): number {
  return timing.coins.hangTick + timing.coins.flightTicks
}

/** When the peeled coins reach the `Lining −X` tag. */
export function peelLandTick(timing: BurstTiming = BURST_TIMING): number {
  return timing.lining.liningPeelTick + timing.coins.flightTicks
}
