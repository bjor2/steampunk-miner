import { describe, expect, it } from 'vitest'
import { LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import {
  droppedHeatShareOf,
  gaugeRatchetOf,
  gaugeRatchetRatioOf,
  gaugeRatchetTextOf,
  heatCapTextOf,
  isGaugeNoLowerThanMain,
  isSettledAtLaw,
  settleableHeatTicksOf,
  settledPerLawWorkOf,
  settledVsLawOf,
} from './heatCapReadings'

// The readings both lanes print beside VS's heat bar (ticket 535, VS 6232473040 and the ratchet
// correction 6234304278, option iii): what the #113 cap lets a report settle, the share of the law
// heat it drops, and the ratchet against main, printed with each red row's reason and never
// gated. The cap itself is #541's.

const LAW_WORK = 1000
/** A row of 100 drill ticks of law work, in the carry's unit. */
const HUNDRED_TICKS_LAW = 100 * LAW_WORK_PER_DRILL_TICK

describe('heat cap readings (ticket 535)', () => {
  it('lets a report settle what it fed, capped at the ticks since the gauge settled', () => {
    expect(settleableHeatTicksOf(16, 12)).toBe(12)
    expect(settleableHeatTicksOf(7, 12)).toBe(7)
    expect(settleableHeatTicksOf(-1, 12)).toBe(0)
  })

  it('reads the share of the law heat the cap drops, negative above the law', () => {
    const read = { lawWork: LAW_WORK, heatTicks: 100, settleableHeatTicks: 80 }
    expect(droppedHeatShareOf(read, 100)).toBeCloseTo(0.2, 9)
    expect(droppedHeatShareOf({ ...read, settleableHeatTicks: 120 }, 100)).toBeCloseTo(-0.2, 9)
    expect(droppedHeatShareOf(read, 0)).toBe(0)
  })

  it('holds the ratchet when the charged branch settles at least main per unit of law work', () => {
    const main = { lawWork: LAW_WORK, heatTicks: 80, settleableHeatTicks: 80 }
    expect(isGaugeNoLowerThanMain({ ...main, settleableHeatTicks: 80 }, main)).toBe(true)
    expect(isGaugeNoLowerThanMain({ ...main, settleableHeatTicks: 95 }, main)).toBe(true)
    expect(isGaugeNoLowerThanMain({ ...main, settleableHeatTicks: 60 }, main)).toBe(false)
  })

  it('allows one drill tick of quantization under main', () => {
    const main = { lawWork: LAW_WORK, heatTicks: 80, settleableHeatTicks: 80 }
    expect(isGaugeNoLowerThanMain({ ...main, settleableHeatTicks: 79 }, main)).toBe(true)
    expect(isGaugeNoLowerThanMain({ ...main, settleableHeatTicks: 78 }, main)).toBe(false)
  })

  it('compares per unit of law work, so a longer main leg is no harder to match', () => {
    const main = { lawWork: 2 * LAW_WORK, heatTicks: 160, settleableHeatTicks: 160 }
    const charged = { lawWork: LAW_WORK, heatTicks: 80, settleableHeatTicks: 80 }
    expect(isGaugeNoLowerThanMain(charged, main)).toBe(true)
    expect(gaugeRatchetRatioOf(charged, main)).toBeCloseTo(1, 9)
  })

  it('holds a row where either side removed nothing, and reads its ratio as infinite over a bare main', () => {
    const bare = { lawWork: 0, heatTicks: 0, settleableHeatTicks: 0 }
    const charged = { lawWork: LAW_WORK, heatTicks: 80, settleableHeatTicks: 80 }
    expect(isGaugeNoLowerThanMain(charged, bare)).toBe(true)
    expect(isGaugeNoLowerThanMain(bare, charged)).toBe(true)
    expect(settledPerLawWorkOf(bare)).toBe(0)
    expect(gaugeRatchetRatioOf(charged, bare)).toBe(Infinity)
  })

  it('reads a row at the law when it settles the law heat less one drill tick', () => {
    const atLaw = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 100, settleableHeatTicks: 100 }
    expect(settledVsLawOf(atLaw)).toBeCloseTo(1, 9)
    expect(isSettledAtLaw(atLaw)).toBe(true)
    expect(isSettledAtLaw({ ...atLaw, settleableHeatTicks: 99 })).toBe(true)
    expect(isSettledAtLaw({ ...atLaw, settleableHeatTicks: 98 })).toBe(false)
    expect(settledVsLawOf({ lawWork: 0, heatTicks: 0, settleableHeatTicks: 0 })).toBe(0)
  })

  it('reads no lower than main as green, with no reason to print', () => {
    const main = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 100, settleableHeatTicks: 100 }
    const ratchet = gaugeRatchetOf({ ...main, settleableHeatTicks: 100 }, main)
    expect(ratchet.verdict).toBe('no lower than main')
    expect(ratchet.reasons).toEqual([])
    expect(ratchet.ratioToMain).toBeCloseTo(1, 9)
    expect(ratchet.ratioToLaw).toBeCloseTo(1, 9)
  })

  it('reads below main but at the law as reason 1: main heats above the law (@12)', () => {
    // Main @12 heats one tick per drilling tick, 2.3 to 4.1 times the law on the fast rigs.
    const main = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 300, settleableHeatTicks: 300 }
    const charged = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 100, settleableHeatTicks: 100 }
    const ratchet = gaugeRatchetOf(charged, main)
    expect(ratchet.verdict).toBe('below main, at the law')
    expect(ratchet.reasons).toEqual([
      'reason 1: main heats one tick per drilling tick, above the law',
    ])
    expect(ratchet.ratioToMain).toBeCloseTo(1 / 3, 9)
  })

  it('reads below main and the law as amber with reason 2: the cap clipped the bursty feed (@1)', () => {
    // A level bore at every tick: the law-exact feed of 0, 1, 2 ticks a report loses its 2s to
    // the cap, main's 1 a tick never does (0.81 of main, 0.60 of the law on the slab).
    const main = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 75, settleableHeatTicks: 75 }
    const charged = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 100, settleableHeatTicks: 60 }
    const ratchet = gaugeRatchetOf(charged, main)
    expect(ratchet.verdict).toBe('amber: below main and the law')
    expect(ratchet.reasons).toEqual([
      'reason 2: the law-exact feed is bursty and the #113 cap clips it (#541)',
    ])
    expect(ratchet.ratioToMain).toBeCloseTo(0.8, 9)
    expect(ratchet.ratioToLaw).toBeCloseTo(0.6, 9)
  })

  it('prints both reasons where main heats above the law and the cap clips the charged feed', () => {
    const main = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 125, settleableHeatTicks: 125 }
    const charged = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 100, settleableHeatTicks: 60 }
    expect(gaugeRatchetOf(charged, main).reasons).toHaveLength(2)
  })

  it('prints the ratchet line with the ratios, the verdict and the reasons', () => {
    const main = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 75, settleableHeatTicks: 75 }
    const charged = { lawWork: HUNDRED_TICKS_LAW, heatTicks: 100, settleableHeatTicks: 60 }
    expect(gaugeRatchetTextOf(gaugeRatchetOf(charged, main), 'main @1')).toBe(
      'gauge settles 0.600 of the law, 0.800 of main @1 (amber: below main and the law; ' +
        'reason 2: the law-exact feed is bursty and the #113 cap clips it (#541))',
    )
    expect(gaugeRatchetTextOf(gaugeRatchetOf(main, main), 'main @1')).toBe(
      'gauge settles 0.750 of the law, 1.000 of main @1 (no lower than main)',
    )
  })

  it('prints the fed and settled ticks with the dropped share and the owner ticket', () => {
    const read = { lawWork: LAW_WORK, heatTicks: 100, settleableHeatTicks: 80 }
    expect(heatCapTextOf(read, 100)).toBe(
      "fed 100.0 drill ticks, the rule can settle 80.0 (drops 0.200 of the law's heat; #541 owns the cap)",
    )
    expect(heatCapTextOf({ ...read, settleableHeatTicks: 120 }, 100)).toContain(
      "settles 0.200 above the law's heat",
    )
  })
})
