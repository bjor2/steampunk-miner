import { describe, expect, it } from 'vitest'
import { holdStepTicks, type StepLanding } from '../holdChain'
import {
  PURCHASE_SOUND,
  ratchetLayersOf,
  ratchetSemitonesOf,
  SILENT_PURCHASE_VOICES,
  soundingVoicesAt,
  startFlourish,
  startRatchet,
  steamBedLevelOf,
  type PurchaseVoices,
} from './purchaseSound'

/** A major's compressed in-chain moment (#180 section 2). */
const COMPRESSED_MOMENT_TICKS = 36

/** A held spree of `count` steps with a major every tenth step, as two-tier tracks give. */
function spreeLandings(count: number): StepLanding[] {
  return Array.from({ length: count }, (_, index) => ((index + 1) % 10 === 0 ? 'major' : 'pip'))
}

/** The most voices of each kind that sound at any step of the spree. */
function loudestMomentOfSpree(count: number): { ratchet: number; flourish: number } {
  const landings = spreeLandings(count)
  const ticks = holdStepTicks(landings, 0)
  let voices: PurchaseVoices = SILENT_PURCHASE_VOICES
  const loudest = { ratchet: 0, flourish: 0 }
  ticks.forEach((tick, index) => {
    const gap = index === 0 ? null : tick - ticks[index - 1]
    voices = startRatchet(voices, tick, ratchetLayersOf(gap)).voices
    if (landings[index] === 'major') voices = startFlourish(voices, tick, COMPRESSED_MOMENT_TICKS)
    const sounding = soundingVoicesAt(voices, tick)
    loudest.ratchet = Math.max(loudest.ratchet, sounding.ratchet)
    loudest.flourish = Math.max(loudest.flourish, sounding.flourish)
  })
  return loudest
}

describe('workshop purchase sound', () => {
  it('keeps a 50-purchase spree within 4 ratchet voices and 1 flourish', () => {
    expect(loudestMomentOfSpree(50)).toEqual({
      ratchet: PURCHASE_SOUND.ratchetVoiceCap,
      flourish: PURCHASE_SOUND.flourishVoiceCap,
    })
    expect(PURCHASE_SOUND.ratchetVoiceCap).toBe(4)
    expect(PURCHASE_SOUND.flourishVoiceCap).toBe(1)
  })

  it('steals the oldest ratchet voice when a fifth would sound', () => {
    const four = startRatchet(SILENT_PURCHASE_VOICES, 0, 4).voices
    const fifth = startRatchet(four, 1, 1)

    expect(fifth.stolen).toBe(1)
    expect(fifth.voices.ratchet.map((voice) => voice.startTick)).toEqual([0, 0, 0, 1])
  })

  it('lets a rung-out voice go without stealing', () => {
    const one = startRatchet(SILENT_PURCHASE_VOICES, 0, 1).voices
    const later = startRatchet(one, PURCHASE_SOUND.ratchetTailTicks, 4)

    expect(later.stolen).toBe(0)
  })

  it('climbs the pentatonic scale one degree per pip', () => {
    const pips = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((pip) => ratchetSemitonesOf(pip))

    expect(pips).toEqual([0, 2, 4, 7, 9, 12, 14, 16, 19])
  })

  it('stacks more layers as the chain speeds up', () => {
    const layers = [null, 30, 19, 16, 12, 9, 6].map((gap) => ratchetLayersOf(gap))

    expect(layers).toEqual([1, 1, 1, 2, 2, 3, 3])
  })

  it('raises the steam bed as the chain climbs the rows', () => {
    expect(steamBedLevelOf(0, 11)).toBeLessThan(steamBedLevelOf(5, 11))
    expect(steamBedLevelOf(10, 11)).toBe(1)
  })

  it('gives a new major the one flourish voice', () => {
    const first = startFlourish(SILENT_PURCHASE_VOICES, 0, COMPRESSED_MOMENT_TICKS)
    const second = startFlourish(first, 10, COMPRESSED_MOMENT_TICKS)

    expect(soundingVoicesAt(second, 10).flourish).toBe(1)
    expect(second.flourish?.startTick).toBe(10)
  })
})
