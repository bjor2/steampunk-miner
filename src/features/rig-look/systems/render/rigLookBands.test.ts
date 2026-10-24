import { describe, expect, it } from 'vitest'
import ECONOMY_FILE from '../../../../systems/economy/economy.json'
import { UPGRADE_IDS } from '../../../../systems/economy/economyDefinition'
import {
  bandAt,
  bandPipsOf,
  bandStartOf,
  bandStepOf,
  decadeStepOf,
  finishesNeededOf,
  medianTwoPlanetBuysOf,
} from './rigLookBands'

/** Systems' decade steps on ticket 809, in levels of each line's own ratio (`economy.json`). */
const DECADE_LEVELS: Readonly<Record<string, number>> = {
  drill_power: 11,
  drill_tip: 11,
  engine: 48,
  boiler: 25,
  cargo_hold: 25,
  hull: 21,
}

/** The ratio as economy.json writes it, the decimal text the bigints read. */
function ratioOf(track: string): string {
  return ECONOMY_FILE.upgrades.find((upgrade) => upgrade.id === track)!.effect.ratio
}

describe('rig look bands', () => {
  it("finds Systems' decade step from each line's ratio in economy.json", () => {
    const found = Object.fromEntries(UPGRADE_IDS.map((id) => [id, decadeStepOf(ratioOf(id), 1)]))
    expect(found).toEqual(DECADE_LEVELS)
  })

  it('counts a two-tier line’s decade in purchases, ten a level', () => {
    expect(decadeStepOf('1.2544', 10)).toBe(110)
    expect(decadeStepOf('1.12', 10)).toBe(210)
  })

  it('takes the decade step exactly where r^k first reaches 10', () => {
    // 1.25^10 = 9.31, 1.25^11 = 11.6; 10^1 = 10 exactly.
    expect(decadeStepOf('1.25', 1)).toBe(11)
    expect(decadeStepOf('10', 1)).toBe(1)
    expect(decadeStepOf('2', 1)).toBe(4)
  })

  it('refuses a ratio that is not a decimal above 1', () => {
    expect(() => decadeStepOf('1', 1)).toThrow()
    expect(() => decadeStepOf('1e3', 1)).toThrow()
  })

  it('steps by the decade, or by the bot’s two-planet buys when fewer, never below 1', () => {
    expect(bandStepOf(48, 5)).toBe(5)
    expect(bandStepOf(11, 60)).toBe(11)
    expect(bandStepOf(25, 0)).toBe(1)
  })

  it('takes the median over every two neighbouring planets of every run', () => {
    // Windows 3+1, 1+5, 5+0 and 2+2, 2+2: 4, 6, 5, 4, 4.
    expect(
      medianTwoPlanetBuysOf([
        [3, 1, 5, 0],
        [2, 2, 2],
      ]),
    ).toBe(4)
    expect(medianTwoPlanetBuysOf([[1, 2, 4]])).toBe(4)
    expect(medianTwoPlanetBuysOf([])).toBe(0)
  })

  it('starts band b at b steps and holds it until the next', () => {
    expect([0, 5, 6, 11, 12].map((n) => bandAt(6, n))).toEqual([0, 0, 1, 1, 2])
    expect(bandStartOf(6, 3)).toBe(18)
  })

  it('counts a band’s pips as the decades of power at its start', () => {
    expect([1, 2, 3, 4].map((band) => bandPipsOf(5, 48, band))).toEqual([0, 0, 0, 0])
    expect([9, 10, 19, 20].map((band) => bandPipsOf(5, 48, band))).toEqual([0, 1, 1, 2])
  })

  it('needs enough finishes that bands sharing one are a decade apart', () => {
    expect(finishesNeededOf(5, 48)).toBe(10)
    expect(finishesNeededOf(120, 210)).toBe(2)
    expect(finishesNeededOf(60, 110)).toBe(2)
    expect(finishesNeededOf(1, 9)).toBe(9)
  })

  it('never repeats a finish and pip count on a line, up to a million purchases', () => {
    for (const [step, decade] of [
      [5, 48],
      [11, 25],
      [6, 11],
    ]) {
      const finishes = finishesNeededOf(step, decade)
      const seen = new Set<string>()
      for (let band = 1; band * step <= 1_000_000; band++) {
        const shown = `${band % finishes}:${bandPipsOf(step, decade, band)}`
        expect(seen.has(shown)).toBe(false)
        seen.add(shown)
      }
    }
  })
})
