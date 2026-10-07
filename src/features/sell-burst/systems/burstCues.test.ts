import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../systems/money'
import { BURST_TIMING } from './burstTiming'
import { playBurstCuesBetween, tickerClacksOf, type BurstCuePlayer } from './burstCues'
import type { BurstSale } from './burstWave'
import { burstWithSale, type SellBurst } from './sellBurst'

function saleOf(credits: string, liningPaid: string, coinsShown = 12): BurstSale {
  return {
    items: [{ tier: 1, amount: 4 }],
    credits: fromCanonical(credits),
    coinsShown,
    liningPaid: fromCanonical(liningPaid),
    nextStepPrice: fromCanonical('100'),
  }
}

/** Every cue the burst plays, in frames of `step` ticks from its sale to its end. */
function cuesInFramesOf(burst: SellBurst, step: number): string[] {
  const played: string[] = []
  const player: BurstCuePlayer = {
    clatter: () => played.push('clatter'),
    clack: () => played.push('clack'),
    coin: (note) => played.push(`coin ${note}`),
    peel: () => played.push('peel'),
    bell: () => played.push('bell'),
  }
  for (let after = 99; after < burst.endTick; after += step) {
    playBurstCuesBetween(burst, after, Math.min(after + step, burst.endTick), player)
  }
  return played
}

describe('sell burst sound', () => {
  it('plays one clatter, a clack per digit, a cascade and no clank or bell for a small sale', () => {
    const cues = cuesInFramesOf(burstWithSale(null, saleOf('400', '0'), 100, false), 1)
    expect(cues.filter((cue) => cue === 'clatter')).toHaveLength(1)
    expect(cues.filter((cue) => cue === 'clack')).toHaveLength(3)
    expect(cues.filter((cue) => cue.startsWith('coin')).length).toBeGreaterThan(0)
    expect(cues).not.toContain('peel')
    expect(cues).not.toContain('bell')
  })

  it('plays the peeled coins one low clank and the flare its bell', () => {
    const cues = cuesInFramesOf(burstWithSale(null, saleOf('1400', '100'), 100, false), 1)
    expect(cues.filter((cue) => cue === 'peel')).toHaveLength(1)
    expect(cues.filter((cue) => cue === 'bell')).toHaveLength(1)
  })

  it('keeps the cascade to one note every other tick however many coins land', () => {
    const cues = cuesInFramesOf(burstWithSale(null, saleOf('400', '0', 40), 100, false), 1)
    const notes = cues.filter((cue) => cue.startsWith('coin'))
    const streamTicks = BURST_TIMING.coins.landTick - BURST_TIMING.coins.hangTick
    expect(notes.length).toBeLessThanOrEqual(streamTicks / BURST_TIMING.coins.cascadeGapTicks)
  })

  it('climbs the cascade higher the more coins a sale shows', () => {
    const firstNote = (coins: number) =>
      cuesInFramesOf(burstWithSale(null, saleOf('400', '0', coins), 100, false), 1).find((cue) =>
        cue.startsWith('coin'),
      )
    expect(firstNote(3)).toBe('coin 0')
    expect(firstNote(40)).toBe('coin 4')
  })

  it('plays the same cues at 30 and 144 frames a second', () => {
    const burst = burstWithSale(null, saleOf('1400', '100'), 100, false)
    const sorted = (cues: string[]) => [...cues].sort()
    expect(sorted(cuesInFramesOf(burst, 2))).toEqual(sorted(cuesInFramesOf(burst, 1)))
  })

  it('clacks once per digit of the whole credits, at most six times', () => {
    expect(tickerClacksOf(fromCanonical('0.5'))).toBe(1)
    expect(tickerClacksOf(fromCanonical('400'))).toBe(3)
    expect(tickerClacksOf(fromCanonical('1e+2900'))).toBe(6)
  })
})
