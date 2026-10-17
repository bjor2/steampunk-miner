import { describe, expect, it } from 'vitest'
import {
  droppedHeatShareOf,
  gaugeRatchetRatioOf,
  heatCapTextOf,
  isGaugeNoLowerThanMain,
  settleableHeatTicksOf,
  settledPerLawWorkOf,
} from './heatCapReadings'

// The readings both lanes print beside VS's heat bar (ticket 535, VS 6232473040): what the #113
// cap lets a report settle, the share of the law heat it drops, and the ratchet that holds the
// charged branch's gauge to main's. The cap itself is #541's.

const LAW_WORK = 1000

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
