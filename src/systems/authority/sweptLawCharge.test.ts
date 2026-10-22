import { describe, expect, it } from 'vitest'
import { BASIS_POINTS } from '../../constants/balance'
import { AUTHORITY_DEV_FLAGS, DEV_FLAGS } from '../../constants/devFlags'
import { CUT_ENERGY_DENOMINATOR, LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import { newVehicleState } from '../vehicle/vehicleState'
import { energyNumeratorOfLawWork } from './cutCarryFixtures'
import { withDriveReaching } from './driveRigFixtures'
import type { DrillCarve } from './drillGearCut'
import { LAW_SUB_STEP_CLOCK, LAW_WORK_CLOCK } from './groundDrill'
import {
  isUnderRatchet,
  isUnderTankFloor,
  isWithinLawShare,
  lawChargeBarsOf,
  type LawChargeBars,
} from './lawChargeBars'
import { cutSlab, strideOfRig, strideOfSpeedMps, type SlabTrack } from './lawCarrySlabFixtures'
import { LADDER_RIGS, SPEED_RIGS } from './lawSlabRigs'

// The swept cut charged on the law work it removed (ticket 540, Systems' ruling 6231144515, the
// TD seam 6234992964 as VS 6234998337 and the GD confirmed it): behind `drill.sweptLawCharge` a
// `drillStep` pays A6's rule on its own carve's tally, energy alone, so it lands within 1% of the
// analytic law value where the shipped per-cell price read 0.62 to 1.74 times it; the carve, its
// cells and its heat are the shipped swept cut's, byte for byte. Short slab tracks on planet 1's
// fixed seed (`lawCarrySlabFixtures.ts`); the lane (`sweptLawSlab.lane.test.ts`) cuts every rig
// and track Systems listed. Law work is read command by command from the ground, so lining the
// rig laid and cut again counts at its grade.

const FAST = SPEED_RIGS['44 m/s'].levels
/** The fast rig with a drive that reaches its 44 m/s: a level bore moves at min(cut, drive) (#723). */
const FAST_LEVEL = withDriveReaching(FAST, SPEED_RIGS['44 m/s'].speedMps)
const SLOW = LADDER_RIGS['stored 1']
const FAST_STRIDE = strideOfRig(FAST, strideOfSpeedMps(SPEED_RIGS['44 m/s'].speedMps))
const SLOW_STRIDE = strideOfRig(SLOW)
const SHORT_MM = 20_000

function trackOf(section: SlabTrack['section'], strideMm: number): SlabTrack {
  return { tilt: 'flat', section, strideMm, lengthMm: SHORT_MM }
}

/** The swept law run's bars against the law work it removed, command by command. */
function barsOf(track: SlabTrack, levels: Record<string, number>): LawChargeBars {
  const run = cutSlab(track, 'swept law', levels)
  return lawChargeBarsOf({ ...run, lawWork: run.lawWorkCut })
}

function expectAtTheLaw(bars: LawChargeBars): void {
  expect(bars.isMeasurable).toBe(true)
  expect(isWithinLawShare(bars.energyRatio)).toBe(true)
  expect(isUnderTankFloor(bars.energyRatio)).toBe(true)
  expect(isUnderRatchet(bars.energyRatio)).toBe(true)
}

/** A carve of `lawWork` at the drill's whole share, for the clocks' charge alone. */
function carveOfLawWork(lawWork: number): DrillCarve {
  return { lawWork, lawWorkBp: lawWork * BASIS_POINTS } as DrillCarve
}

describe('swept law charge (ticket 540)', () => {
  it('ships on, with the swept cut itself on in the client', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.sweptLawCharge']).toBe(true)
    expect(DEV_FLAGS['drill.sweptCut']).toBe(true)
  })

  it('charges a fast rig within 1% of the law on a level bore, where the per-cell price under-charged', () => {
    expectAtTheLaw(barsOf(trackOf('level', FAST_STRIDE), FAST_LEVEL))
  })

  it('charges within 1% of the law on down legs, fast and slow, where the per-cell price over-charged', () => {
    expectAtTheLaw(barsOf(trackOf('down', FAST_STRIDE), FAST))
    expectAtTheLaw(barsOf(trackOf('down', SLOW_STRIDE), SLOW))
  })

  it('keeps the quanta it charged times the denominator plus its carry equal to the law work removed', () => {
    const run = cutSlab(trackOf('down', SLOW_STRIDE), 'swept law', SLOW)
    const charged = run.energy * CUT_ENERGY_DENOMINATOR + run.energyCarry
    expect(charged).toBe(energyNumeratorOfLawWork(run.lawWorkCut))
  })

  it('cuts and heats byte for byte as the shipped swept charge', () => {
    for (const [track, levels] of [
      [trackOf('level', FAST_STRIDE), FAST_LEVEL],
      [trackOf('down', SLOW_STRIDE), SLOW],
    ] as const) {
      const shipped = cutSlab(track, 'swept', levels)
      const law = cutSlab(track, 'swept law', levels)
      expect(law.broken).toEqual(shipped.broken)
      expect(law.chunks).toBe(shipped.chunks)
      expect(law.lawWorkCut).toBe(shipped.lawWorkCut)
      expect(law.heatTicks).toBe(shipped.heatTicks)
      expect(law.rejections).toBe(0)
    }
  })

  // Since ticket 570 the cut never takes the lining it laid behind it (#41), so the lined row
  // crosses a lined pocket laid ahead of it, and the lined run's own rings stay whole.
  it('prices cleared lining inside the law work, neither twice nor under, lined and unlined', () => {
    const lined = { ...trackOf('level', SLOW_STRIDE), lengthMm: 12_000, linedPocketsAtMm: [6_000] }
    const ownRings = { ...trackOf('level', SLOW_STRIDE), lengthMm: 12_000 }
    const unlined = { ...trackOf('level', SLOW_STRIDE), lengthMm: 5_000, casingGrade: 0 }
    const linedRun = cutSlab(lined, 'swept law', SLOW)
    const unlinedRun = cutSlab(unlined, 'swept law', SLOW)
    expect(linedRun.casingSamples).toBeGreaterThan(0)
    expect(cutSlab(ownRings, 'swept law', SLOW).casingSamples).toBe(0)
    expect(unlinedRun.casingSamples).toBe(0)
    expectAtTheLaw(lawChargeBarsOf({ ...linedRun, lawWork: linedRun.lawWorkCut }))
    expectAtTheLaw(lawChargeBarsOf({ ...unlinedRun, lawWork: unlinedRun.lawWorkCut }))
  })

  it('never writes the heat carry, which nothing on the swept path drains', () => {
    const vehicle = { ...newVehicleState(null, 0), energy: 1_000_000 }
    const charge = LAW_SUB_STEP_CLOCK.chargeOf(
      carveOfLawWork(LAW_WORK_PER_DRILL_TICK * 3 + 7),
      () => 0,
      vehicle,
    )
    expect(charge.vehicle.cutHeatCarry).toBeUndefined()
    expect(charge.quanta).toBe(12)
  })

  it('shares one energy carry with the report charge, so switching path pays nothing twice', () => {
    const vehicle = { ...newVehicleState(null, 0), energy: 1_000_000 }
    const parts = [LAW_WORK_PER_DRILL_TICK / 3, 17, LAW_WORK_PER_DRILL_TICK * 2 + 5]
    let mixed = vehicle
    let quanta = 0
    parts.forEach((law, index) => {
      const clock = index % 2 === 0 ? LAW_SUB_STEP_CLOCK : LAW_WORK_CLOCK
      const charge = clock.chargeOf(carveOfLawWork(law), () => 0, mixed)
      quanta += charge.quanta
      mixed = charge.vehicle
    })
    const total = parts.reduce((sum, law) => sum + law, 0)
    const whole = LAW_SUB_STEP_CLOCK.chargeOf(carveOfLawWork(total), () => 0, vehicle)
    expect(quanta).toBe(whole.quanta)
    expect(mixed.cutEnergyCarry).toBe(whole.vehicle.cutEnergyCarry)
  })
})
