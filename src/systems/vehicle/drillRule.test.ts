import { describe, expect, it } from 'vitest'
import { blockHardness } from '../economy/oreEconomy'
import { drillPower, drillTip } from '../economy/vehicleStats'
import { add, cmp, fromCanonical, mul, ZERO_MONEY, type BigStat } from '../money'
import {
  canScratch,
  drillDamage,
  drillWorkPerTick,
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

  it('caps the tile speed at 24 ticks with drill_power level 20 on hardness 1', () => {
    expect(ticksPerTile(drillOf(drillPower(20), drillTip(0)), m('1'))).toBe(24)
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
