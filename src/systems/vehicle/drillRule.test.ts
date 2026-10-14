import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { ECONOMY } from '../economy/economy'
import { blockHardness } from '../economy/oreEconomy'
import { drillPower, drillTip, onCurveLevels, vehicleStatsAt } from '../economy/vehicleStats'
import { add, cmp, fromCanonical, mul, ZERO_MONEY, type BigStat } from '../money'
import {
  canScratch,
  drillDamage,
  drillWorkPerTick,
  subStepsPerTile,
  ticksPerTile,
  tileWorkToBreak,
  type DrillStats,
} from './drillRule'
import { ENERGY_QUANTA_PER_TICK, quantaOfUnitText } from './energyQuanta'

const m = fromCanonical

/** A drill whose live tip is its gate tip: a vehicle at a major. */
function drillOf(drillPower: BigStat, drillTip: BigStat): DrillStats {
  return { drillPower, drillTip, gateTip: drillTip }
}
const LEVEL_0: DrillStats = drillOf(drillPower(0), drillTip(0))

/** Ticks of accumulated work until the tile breaks, as the authority adds it. */
function ticksByAccumulating(drill: DrillStats, hardness: BigStat): number {
  const perTick = drillWorkPerTick(drill, hardness)
  let work = ZERO_MONEY
  let ticks = 0
  while (cmp(work, tileWorkToBreak(hardness)) < 0) {
    work = add(work, perTick)
    ticks++
  }
  return ticks
}

describe('drill rule', () => {
  it('opens a cell on the tip of the last completed major, never on a live pip past the floor', () => {
    const hardness = m('8')
    const onPip = { drillPower: m('1.5'), drillTip: m('2.1'), gateTip: m('1.9') }
    expect(canScratch(onPip.drillTip, hardness)).toBe(true)
    expect(ticksPerTile(onPip, hardness)).toBeNull()
    expect(drillDamage(onPip, hardness, 60)).toEqual(ZERO_MONEY)
    expect(ticksPerTile({ ...onPip, gateTip: m('2') }, hardness)).not.toBeNull()
  })

  it('takes 40, 79, 156, 308 and 608 ticks for bands 1 to 5 at level 0 on planet 1', () => {
    const ticks = [1, 2, 3, 4, 5].map((band) => ticksPerTile(LEVEL_0, blockHardness(1, band)))
    expect(ticks).toEqual([40, 79, 156, 308, 608])
  })

  it('gives each band hardness 1.2544^(b-1) on planet 1', () => {
    expect(blockHardness(1, 3)).toEqual(mul(m('1.2544'), m('1.2544')))
  })

  it('holds the tile speed at the 4-tick floor with drill_power level 40 on hardness 1', () => {
    expect(ticksPerTile(drillOf(drillPower(40), drillTip(0)), m('1'))).toBe(4)
  })

  it('breaks a tile after exactly ticksPerTile ticks of accumulated work', () => {
    for (const band of [1, 2, 3, 4, 5]) {
      const hardness = blockHardness(1, band)
      expect(ticksByAccumulating(LEVEL_0, hardness)).toBe(ticksPerTile(LEVEL_0, hardness))
    }
  })

  it('takes four times the ticks, so four times the energy, when H is twice the tip', () => {
    const hardness = m('2')
    const fullTip = ticksPerTile(drillOf(m('1.5'), m('2')), hardness) ?? 0
    const halfTip = ticksPerTile(drillOf(m('1.5'), m('1')), hardness) ?? 0
    expect(halfTip).toBe(4 * fullTip)
    expect(halfTip * ENERGY_QUANTA_PER_TICK.drill).toBe(4 * fullTip * ENERGY_QUANTA_PER_TICK.drill)
  })

  it('cannot scratch a tile harder than four times the tip', () => {
    const drill = drillOf(m('1e9'), m('1'))
    expect(canScratch(m('1'), m('4.0001'))).toBe(false)
    expect(drillWorkPerTick(drill, m('4.0001'))).toEqual(ZERO_MONEY)
    expect(ticksPerTile(drill, m('4.0001'))).toBeNull()
    expect(canScratch(m('1'), m('4'))).toBe(true)
  })

  it("holds a cell's own scratch floor of 1 until the tip matches its hardness (#142, #232)", () => {
    const drill = drillOf(m('1e9'), m('1'))
    const floor = m('1')
    expect(canScratch(m('1'), m('1.0001'), floor)).toBe(false)
    expect(ticksPerTile(drill, m('1.0001'), floor)).toBeNull()
    expect(drillDamage(drill, m('1.0001'), 60, floor)).toEqual(ZERO_MONEY)
    expect(ticksPerTile(drill, m('1'), floor)).toBe(ticksPerTile(drill, m('1')))
  })

  it('deals ticks * drillPower * eff / 60 of damage', () => {
    expect(drillDamage(LEVEL_0, m('1'), 40)).toEqual(m('1'))
    expect(drillDamage(LEVEL_0, m('2'), 60)).toEqual(m('0.375'))
  })
})

describe('fractional drill time (ticket 330)', () => {
  const Q = DRILL_SUBSTEPS_PER_TICK

  it('keeps the floor at 4 whole ticks, counted in sub-steps', () => {
    expect(subStepsPerTile(drillOf(drillPower(40), drillTip(0)), m('1'))).toBe(4 * Q)
  })

  it('rounds a cell up to its next sub-step, never to the next whole tick', () => {
    for (const band of [1, 2, 3, 4, 5]) {
      const hardness = blockHardness(1, band)
      const subSteps = subStepsPerTile(LEVEL_0, hardness) ?? 0
      const ticks = ticksPerTile(LEVEL_0, hardness) ?? 0
      expect(subSteps).toBeLessThanOrEqual(ticks * Q)
      expect(subSteps).toBeGreaterThan((ticks - 1) * Q)
    }
  })

  it('answers a fraction of a tick where the whole-tick rule rounds up', () => {
    // 1.5 power at a full tip: 60 * 2 / 1.5 = 80 ticks on hardness 2, 81.2 on hardness 2.03.
    const drill = drillOf(m('1.5'), m('3'))
    expect(subStepsPerTile(drill, m('2'))).toBe(80 * Q)
    expect(subStepsPerTile(drill, m('2.03'))).toBe(4872)
    expect(ticksPerTile(drill, m('2.03'))).toBe(82)
  })

  it('cannot scratch where the whole-tick rule cannot', () => {
    const drill = drillOf(m('1e9'), m('1'))
    expect(subStepsPerTile(drill, m('4.0001'))).toBeNull()
    expect(subStepsPerTile(drill, m('1.0001'), m('1'))).toBeNull()
  })
})

// The VS amendment and the GD ruling on ticket 396: the 4-tick floor is a stopgap, never a design
// value. #397 takes `minTicksPerTile` out of the drill law and deletes this block.
describe('stopgap tile floor (ticket 396)', () => {
  it('holds the floor at 4 ticks, 15 tiles/s (todo: removed by #397/#335)', () => {
    expect(ECONOMY.drill.minTicksPerTile).toBe(4)
  })

  it.todo('cuts with no constant floor at any drill level (#397/#335 remove minTicksPerTile)')

  // Planet 8 band rock under a capped drill: 60 * m * H^3 over 60 * H^3 at 40 digits landed a
  // hair over m, so the cell read 5 ticks and 241 sub-steps.
  it('breaks a capped cell in exactly the floor whatever its hardness', () => {
    const strong = drillOf(m('1e10'), m('1e4'))
    const hardnesses = [m('183.6661163355495043607009944010986059235'), m('1'), m('7.31')]
    for (const hardness of hardnesses) {
      expect(ticksPerTile(strong, hardness)).toBe(ECONOMY.drill.minTicksPerTile)
      expect(subStepsPerTile(strong, hardness)).toBe(
        ECONOMY.drill.minTicksPerTile * DRILL_SUBSTEPS_PER_TICK,
      )
    }
  })
})

/** Band-1 cells a second on planet 1 (hardness 1, tip at least 1) at a drill_power major. */
function bandOneCellsPerSecond(level: number): number {
  const subSteps = subStepsPerTile(drillOf(drillPower(level), drillTip(0)), m('1')) ?? 0
  return (DRILL_SUBSTEPS_PER_TICK * TICKS_PER_SECOND) / subSteps
}

// The GD ruling on ticket 396: "every level adds speed" is a ratio, each drill major worth 1.12x
// +-5% with no dips, asserted on planet 1 here (Systems' rows take the bot to L17.2 on P1).
describe('felt speed per drill level (ticket 396)', () => {
  const P1_LEVELS = Array.from({ length: 18 }, (_, level) => level)

  it('makes each drill major from 0 to 18 cut band 1 of planet 1 1.12x +-5% faster', () => {
    const ratios = P1_LEVELS.map((level) => ({
      level,
      isWorth112: isWithinFivePercentOf112(
        bandOneCellsPerSecond(level + 1) / bandOneCellsPerSecond(level),
      ),
    }))
    expect(ratios).toEqual(P1_LEVELS.map((level) => ({ level, isWorth112: true })))
  })

  it('cuts band 1 at 1.5 cells/s at level 0 and past 10 cells/s at level 17', () => {
    expect(bandOneCellsPerSecond(0)).toBe(1.5)
    expect(bandOneCellsPerSecond(17)).toBeGreaterThanOrEqual(10)
  })
})

function isWithinFivePercentOf112(ratio: number): boolean {
  return ratio >= 1.12 * 0.95 && ratio <= 1.12 * 1.05
}

describe('energy quanta', () => {
  it('drains 4, 6 and 1 quanta of 1/240 unit per tick for drilling, thrust and driving', () => {
    expect(ENERGY_QUANTA_PER_TICK).toEqual({ drill: 4, thrust: 6, drive: 1 })
  })

  it('makes 60 drilling ticks exactly one unit', () => {
    expect(60 * ENERGY_QUANTA_PER_TICK.drill).toBe(quantaOfUnitText('1'))
  })

  it('reads whole quanta from a unit string and refuses anything finer', () => {
    expect(quantaOfUnitText('37.5')).toBe(9000)
    expect(quantaOfUnitText('0.001')).toBeNull()
    expect(quantaOfUnitText('-1')).toBeNull()
  })
})

// #316 TD scope f (ticket 340): ticksPerTile leaves Money through toSafeInteger, which throws only
// when one cell would take more than 2^53 ticks. Asserted rather than retyped (#330 turns it into
// sub-steps).
describe('drill rule: whole ticks per tile stay a safe integer', () => {
  const LAST_PLANET = 200
  const BANDS = [1, 2, 3, 4, 5]

  it('gives every band of planets 1 to 200 a safe tick count with the on-curve drill', () => {
    for (let planet = 1; planet <= LAST_PLANET; planet++) {
      const drill = vehicleStatsAt(onCurveLevels(planet))
      for (const band of BANDS) {
        const ticks = ticksPerTile(drill, blockHardness(planet, band))
        if (ticks !== null) expect(Number.isSafeInteger(ticks)).toBe(true)
      }
    }
  })

  it('throws, never rounds, when one cell would take more than 2^53 ticks', () => {
    const crawling = drillOf(m('1e-30'), m('1'))
    expect(() => ticksPerTile(crawling, m('1'))).toThrow(RangeError)
  })
})
