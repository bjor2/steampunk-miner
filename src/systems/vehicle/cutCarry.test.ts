import { describe, expect, it } from 'vitest'
import { BASIS_POINTS, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { ENERGY_QUANTA_PER_TICK } from './energyQuanta'
import {
  CUT_ENERGY_DENOMINATOR,
  LAW_WORK_PER_DRILL_TICK,
  payLawWork,
  payLawWorkEnergy,
  splitCutHeatCarry,
  withoutCutCarry,
  type LawWorkTally,
} from './cutCarry'

// The report cut's charge on density removed with an integer carry (ticket 535, A6, Option L):
// the same law work costs the same quanta and heats the same ticks however it is split over
// reports, what one quantum does not cover is carried, a tank that cannot pay keeps the debt, and
// the carry is never negative.

const DRILL_QUANTA = ENERGY_QUANTA_PER_TICK.drill
const FULL_TANK = 1_000_000

/** A tally with every cell at the drill's whole share. */
function wholeShare(law: number): LawWorkTally {
  return { law, lawBp: law * BASIS_POINTS, quantum: DRILL_SUBSTEPS_PER_TICK }
}

/** Pays each tally in turn from a full tank; the quanta paid, heat ticks and the vehicle after. */
function payEach(tallies: readonly LawWorkTally[]) {
  let vehicle: { cutEnergyCarry?: number; cutHeatCarry?: number } = {}
  let quanta = 0
  let heatTicks = 0
  for (const tally of tallies) {
    const paid = payLawWork(vehicle, tally, FULL_TANK)
    const heated = splitCutHeatCarry(paid.vehicle)
    quanta += paid.quanta
    heatTicks += heated.heatTicks
    vehicle = heated.vehicle
  }
  return { quanta, heatTicks, vehicle }
}

describe('cut carry (ticket 535)', () => {
  it('charges a drill tick of law work the drill quanta of a tick, and heats one tick', () => {
    const paid = payEach([wholeShare(LAW_WORK_PER_DRILL_TICK)])
    expect(paid).toEqual({ quanta: DRILL_QUANTA, heatTicks: 1, vehicle: {} })
  })

  it('pays and heats many small tallies exactly as the one tally of their sum', () => {
    const parts = [1, 17, 244_799, 60_000, 0, 3, 400_000, 244_800, 12_345].map(wholeShare)
    const total = wholeShare(parts.reduce((sum, { law }) => sum + law, 0))
    expect(payEach(parts)).toEqual(payEach([total]))
    expect(payEach([total]).quanta).toBe(
      Math.floor((total.law * DRILL_QUANTA) / LAW_WORK_PER_DRILL_TICK),
    )
  })

  it('keeps cumulative quanta times the denominator plus the carry equal to the law work owed', () => {
    const parts = [123_456, 7, 999_999, 244_800, 31].map(wholeShare)
    const { quanta, vehicle } = payEach(parts)
    const owed = parts.reduce((sum, { lawBp }) => sum + lawBp * DRILL_QUANTA, 0)
    expect(quanta * CUT_ENERGY_DENOMINATOR + (vehicle.cutEnergyCarry ?? 0)).toBe(owed)
    expect(vehicle.cutEnergyCarry ?? 0).toBeGreaterThanOrEqual(0)
    expect(vehicle.cutEnergyCarry ?? 0).toBeLessThan(CUT_ENERGY_DENOMINATOR)
    expect(vehicle.cutHeatCarry ?? 0).toBeLessThan(LAW_WORK_PER_DRILL_TICK)
  })

  it('prices a gear cell at its share and heats it whole', () => {
    const law = LAW_WORK_PER_DRILL_TICK * 2
    const half = { law, lawBp: law * (BASIS_POINTS / 2), quantum: DRILL_SUBSTEPS_PER_TICK }
    const paid = payLawWork({}, half, FULL_TANK)
    expect(paid.quanta).toBe(DRILL_QUANTA)
    expect(splitCutHeatCarry(paid.vehicle).heatTicks).toBe(2)
  })

  it('pays no more than the tank holds and carries the debt for the next cut', () => {
    const tally = wholeShare(LAW_WORK_PER_DRILL_TICK * 3)
    const empty: { cutEnergyCarry?: number; cutHeatCarry?: number } = {}
    const clamped = payLawWork(empty, tally, 5)
    expect(clamped.quanta).toBe(5)
    expect(clamped.vehicle.cutEnergyCarry).toBe((3 * DRILL_QUANTA - 5) * CUT_ENERGY_DENOMINATOR)
    const settled = payLawWork(clamped.vehicle, wholeShare(0), FULL_TANK)
    expect(settled.quanta).toBe(3 * DRILL_QUANTA - 5)
    expect(settled.vehicle.cutEnergyCarry).toBeUndefined()
  })

  it('leaves both carries out at 0, so a vehicle that never drilled by report is unchanged', () => {
    expect(payLawWork({}, wholeShare(0), FULL_TANK)).toEqual({ quanta: 0, vehicle: {} })
    expect(withoutCutCarry({ cutEnergyCarry: 5, cutHeatCarry: 9, energy: 1 })).toEqual({
      energy: 1,
    })
  })
})

describe('cut carry, energy only (ticket 540)', () => {
  it('pays the same quanta and energy carry as the report charge', () => {
    const tallies = [123_456, 7, 999_999, LAW_WORK_PER_DRILL_TICK, 31].map(wholeShare)
    let report: { cutEnergyCarry?: number; cutHeatCarry?: number } = {}
    let swept: { cutEnergyCarry?: number; cutHeatCarry?: number } = {}
    for (const tally of tallies) {
      const reported = payLawWork(report, tally, FULL_TANK)
      const sweptPaid = payLawWorkEnergy(swept, tally, FULL_TANK)
      expect(sweptPaid.quanta).toBe(reported.quanta)
      expect(sweptPaid.vehicle.cutEnergyCarry).toBe(reported.vehicle.cutEnergyCarry)
      report = reported.vehicle
      swept = sweptPaid.vehicle
    }
  })

  it('never writes the heat carry, which nothing on the swept path drains', () => {
    const fresh: { cutEnergyCarry?: number; cutHeatCarry?: number } = {}
    const paid = payLawWorkEnergy(fresh, wholeShare(LAW_WORK_PER_DRILL_TICK * 3 + 17), FULL_TANK)
    expect(paid.vehicle.cutHeatCarry).toBeUndefined()
    const kept = payLawWorkEnergy({ cutHeatCarry: 9 }, wholeShare(5), FULL_TANK)
    expect(kept.vehicle.cutHeatCarry).toBe(9)
  })

  it('pays no more than the tank holds and carries the debt, as the report charge does', () => {
    const tally = wholeShare(LAW_WORK_PER_DRILL_TICK * 3)
    expect(payLawWorkEnergy({}, tally, 5)).toEqual({
      quanta: 5,
      vehicle: { cutEnergyCarry: (3 * DRILL_QUANTA - 5) * CUT_ENERGY_DENOMINATOR },
    })
  })
})

// Ticket 558: the swept cut tallies in the rig's drill quantum, the base doubled, and the carry
// counts in the larger of its own quantum and the tally's, so it stays exact across both.
describe('the energy carry in a lifted drill quantum (ticket 558)', () => {
  const LIFTED = DRILL_SUBSTEPS_PER_TICK * 4

  function liftedShare(law: number): LawWorkTally {
    return { law, lawBp: law * BASIS_POINTS, quantum: LIFTED }
  }

  it('pays a lifted tally as the same law work at the base quantum would cost', () => {
    const none: { cutEnergyCarry?: number; cutEnergyCarryQuantum?: number } = {}
    const base = payLawWorkEnergy(none, wholeShare(LAW_WORK_PER_DRILL_TICK * 3 + 17), FULL_TANK)
    const lifted = payLawWorkEnergy(
      {},
      liftedShare((LAW_WORK_PER_DRILL_TICK * 3 + 17) * 4),
      FULL_TANK,
    )
    expect(lifted.quanta).toBe(base.quanta)
    expect(lifted.vehicle).toEqual({
      cutEnergyCarry: 4 * (base.vehicle.cutEnergyCarry ?? 0),
      cutEnergyCarryQuantum: LIFTED,
    })
  })

  it('keeps the charge exact over base and lifted tallies in any order', () => {
    const tallies = [wholeShare(123_457), liftedShare(7), wholeShare(31), liftedShare(999_999)]
    let vehicle: { cutEnergyCarry?: number; cutEnergyCarryQuantum?: number } = {}
    let quanta = 0
    for (const tally of tallies) {
      const paid = payLawWorkEnergy(vehicle, tally, FULL_TANK)
      quanta += paid.quanta
      vehicle = paid.vehicle
    }
    const owedInLifted = (123_457 + 31) * 4 + 7 + 999_999
    const denominator = CUT_ENERGY_DENOMINATOR * 4
    expect(quanta * denominator + (vehicle.cutEnergyCarry ?? 0)).toBe(
      owedInLifted * BASIS_POINTS * DRILL_QUANTA,
    )
    expect(vehicle.cutEnergyCarryQuantum).toBe(LIFTED)
  })

  it('leaves the quantum out with no carry, and drops it with the carry', () => {
    const paidWhole = payLawWorkEnergy({}, liftedShare(LAW_WORK_PER_DRILL_TICK * 4), FULL_TANK)
    expect(paidWhole).toEqual({ quanta: DRILL_QUANTA, vehicle: {} })
    const carried = payLawWorkEnergy({}, liftedShare(5), FULL_TANK).vehicle
    expect(withoutCutCarry(carried)).toEqual({})
  })
})
