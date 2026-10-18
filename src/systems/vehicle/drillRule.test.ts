import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { TICKS_PER_SECOND } from '../../constants/physics'
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

  it('breaks hardness 1 in one tick at drill_power purchase 18, with no tile floor (#397)', () => {
    expect(ticksPerTile(drillOf(drillPower(18), drillTip(0)), m('1'))).toBe(1)
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

  it('cuts a cell in less than a tick once the drill outruns one cell a tick (#397)', () => {
    // 60 * 60 / (1.5 * 1.12^(1/18) * 1.243^21) = 24.8 sub-steps (#552's per-purchase law).
    expect(subStepsPerTile(drillOf(drillPower(22), drillTip(0)), m('1'))).toBe(25)
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

// The TD lock on #397 (from the GD ruling and the VS amendment on ticket 396): no constant floor
// in the drill law, so a strong enough drill cuts a cell in a single sub-step.
describe('no tile floor (ticket 397)', () => {
  // A sub-step is the law's quantum, so below 10 sub-steps a purchase may round to the same count.
  it('cuts faster at every drill purchase down to 10 sub-steps a cell, then reaches one', () => {
    const subSteps = Array.from({ length: 90 }, (_, level) => bandOneSubSteps(level))
    const steps = subSteps.slice(1).map((after, level) => ({ before: subSteps[level], after }))
    const slower = steps.filter(({ before, after }) => after > before)
    const stalls = steps.filter(({ before, after }) => after === before && before >= 10)
    expect(subSteps.at(-1)).toBe(1)
    expect([...slower, ...stalls]).toEqual([])
  })

  it("breaks a vast drill's cell in one tick and one sub-step whatever its hardness", () => {
    const vast = drillOf(m('1e10'), m('1e4'))
    const hardnesses = [m('183.6661163355495043607009944010986059235'), m('1'), m('7.31')]
    for (const hardness of hardnesses) {
      expect(ticksPerTile(vast, hardness)).toBe(1)
      expect(subStepsPerTile(vast, hardness)).toBe(1)
    }
  })
})

/** Sub-steps a band-1 cell of planet 1 (hardness 1) takes at a drill_power purchase. */
function bandOneSubSteps(level: number): number {
  return subStepsPerTile(drillOf(drillPower(level), drillTip(0)), m('1')) ?? 0
}

/** Band-1 cells a second on planet 1 (hardness 1, tip at least 1) at a drill_power purchase. */
function bandOneCellsPerSecond(level: number): number {
  return (DRILL_SUBSTEPS_PER_TICK * TICKS_PER_SECOND) / bandOneSubSteps(level)
}

// The GD ruling on #551 (ticket 552): a drill level is one purchase, each worth 1.181 to 1.305
// (1.243 +-5%, point 4) with no dips, in place of #396's 1.12 +-5% a major; the first purchase
// keeps its old pip, 1.0063. Judged on the law's sub-steps (ticket 431: the m/s read rounds to
// whole mm a tick).
describe('felt speed per drill purchase (tickets 396 and 552)', () => {
  const P1_PURCHASES = Array.from({ length: 13 }, (_, at) => at + 1)

  it('makes each drill purchase from 1 to 14 cut band 1 of planet 1 1.181 to 1.305 times faster', () => {
    const outside = P1_PURCHASES.filter(
      (purchase) =>
        !isInPurchaseBand(bandOneCellsPerSecond(purchase + 1) / bandOneCellsPerSecond(purchase)),
    )
    expect(outside).toEqual([])
  })

  it('cuts band 1 at 1.5 cells/s at purchase 0 and past 10 cells/s on the planet 1 curve', () => {
    expect(bandOneCellsPerSecond(0)).toBe(1.5)
    expect(bandOneCellsPerSecond(onCurveLevels(1).drill_power)).toBeGreaterThanOrEqual(10)
  })
})

// The TD lock on #397: with the floor gone the purchase band holds through planet 10, on the law's
// sub-steps. Each planet is judged over the purchases its player holds there, from the last
// planet's on-curve drill to this one's plus the bot's lead of one, in every band at the planet's
// on-curve tip; planet 1 starts past the first purchase, which keeps its old pip.
describe('felt speed per drill purchase through planet 10 (tickets 397 and 552)', () => {
  const PLANETS = Array.from({ length: 10 }, (_, index) => index + 1)
  const BANDS = [1, 2, 3, 4, 5]
  const BOT_LEAD_PURCHASES = 1

  it('makes each drill purchase 1.181 to 1.305 times faster in every band of planets 1 to 10', () => {
    const misses = PLANETS.flatMap((planet) =>
      BANDS.flatMap((band) =>
        purchasesHeldOn(planet).filter((purchase) => !isInBandOn(planet, band, purchase)),
      ),
    )
    expect(misses).toEqual([])
  })

  /** The purchases from the last planet's on-curve drill to this planet's plus the bot's lead. */
  function purchasesHeldOn(planet: number): number[] {
    const first = planet === 1 ? 1 : onCurveLevels(planet - 1).drill_power
    const last = onCurveLevels(planet).drill_power + BOT_LEAD_PURCHASES
    return Array.from({ length: last - first }, (_, index) => first + index)
  }

  function isInBandOn(planet: number, band: number, purchase: number): boolean {
    const tip = drillTip(onCurveLevels(planet).drill_tip)
    const hardness = blockHardness(planet, band)
    const before = subStepsPerTile(drillOf(drillPower(purchase), tip), hardness) ?? 0
    const after = subStepsPerTile(drillOf(drillPower(purchase + 1), tip), hardness) ?? 0
    return after > 0 && isInPurchaseBand(before / after)
  }
})

function isInPurchaseBand(ratio: number): boolean {
  return ratio >= 1.181 && ratio <= 1.305
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
