import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { engineStatsAtStep, vehicleStatsAt } from '../economy/vehicleStats'
import {
  CUT_AXIS_CAPS,
  cutCapLines,
  isDriveCappedFacing,
  isGravityRampedFacing,
} from './cutAxisCaps'
import {
  cappedCutSpeedOf,
  cappedCutStepMmOf,
  driveSpeedOf,
  driveStepMmOf,
  driveSubStepsPerCellOf,
  isCutDriveBound,
  sidewaysSubStepsOf,
} from './cutCapSpeed'
import { FACING, type Facing } from './vehiclePose'
import { newVehicleState, type VehicleState } from './vehicleState'

// Bjor's ruling on #723: sideways cut speed = min(drill rate, drive speed); buying a drill
// upgrade never changes drive speed; downward drilling stays drill-only.

const SIDEWAYS: readonly Facing[] = [FACING.left, FACING.right]
const ALONG_UP: readonly Facing[] = [FACING.down, FACING.up]
const DRIVE = 6

function rigWith(levels: Partial<VehicleState['levels']> = {}): VehicleState {
  const fresh = newVehicleState(null, 0)
  return { ...fresh, levels: { ...fresh.levels, ...levels } }
}

describe('cut axis caps (ticket 723)', () => {
  it('holds a sideways cut to the drive and leaves a cut down or up to the drill', () => {
    expect(SIDEWAYS.every(isDriveCappedFacing)).toBe(true)
    expect(ALONG_UP.some(isDriveCappedFacing)).toBe(false)
  })

  it('names every facing exactly once', () => {
    const facings = CUT_AXIS_CAPS.flatMap((cap) => cap.facings)
    expect([...facings].sort()).toEqual(Object.values(FACING).sort())
  })

  it('writes the card lines from the table: sideways capped by drive speed, the ramp down by gravity', () => {
    expect(cutCapLines()).toEqual([
      'Sideways capped by drive speed',
      'Downward ramp follows local gravity',
    ])
  })

  it('ramps only a cut down by local gravity (#724)', () => {
    expect(isGravityRampedFacing(FACING.down)).toBe(true)
    expect([...SIDEWAYS, FACING.up].some(isGravityRampedFacing)).toBe(false)
  })
})

describe('cut speed under the drive cap (ticket 723)', () => {
  it('cuts sideways at the drive speed where the drill is faster', () => {
    for (const facing of SIDEWAYS) expect(cappedCutSpeedOf(facing, 84, DRIVE)).toBe(DRIVE)
  })

  it('cuts sideways at the drill rate where the drill is slower', () => {
    for (const facing of SIDEWAYS) expect(cappedCutSpeedOf(facing, 4.2, DRIVE)).toBe(4.2)
  })

  it('cuts down and up at the drill rate alone, however slow the drive', () => {
    for (const facing of ALONG_UP) expect(cappedCutSpeedOf(facing, 84, DRIVE)).toBe(84)
  })

  it('steps the sideways front no further than the drive, in whole mm rounded up', () => {
    const speedMax = engineStatsAtStep(3).speedMax
    expect(driveStepMmOf(speedMax)).toBe(Math.ceil((speedMax * 1000) / 60))
    expect(cappedCutStepMmOf(FACING.right, 1400, speedMax)).toBe(driveStepMmOf(speedMax))
    expect(cappedCutStepMmOf(FACING.right, 70, speedMax)).toBe(70)
    expect(cappedCutStepMmOf(FACING.down, 1400, speedMax)).toBe(1400)
  })

  it('says a sideways cut is drive-bound only while the drill is faster than the drive', () => {
    expect(isCutDriveBound(FACING.left, 84, DRIVE)).toBe(true)
    expect(isCutDriveBound(FACING.left, DRIVE, DRIVE)).toBe(false)
    expect(isCutDriveBound(FACING.down, 84, DRIVE)).toBe(false)
  })

  // #625: felt speed changes at most 1.5x a cell. The cap is a min, so it never widens the step
  // between two cells' speeds that the drill law already gives.
  it('never makes the speed change between two neighbouring cells larger than the drill does', () => {
    const speeds = Array.from({ length: 40 }, (_, step) => 0.5 * 1.5 ** (step / 4))
    for (const before of speeds) {
      for (const after of speeds) {
        const drillRatio = Math.max(after / before, before / after)
        const capped = [before, after].map((speed) => cappedCutSpeedOf(FACING.right, speed, DRIVE))
        expect(Math.max(capped[1] / capped[0], capped[0] / capped[1])).toBeLessThanOrEqual(
          drillRatio,
        )
      }
    }
  })
})

describe('drive speed (ticket 723)', () => {
  it('is the engine top speed', () => {
    const rig = rigWith({ engine: 13 })
    expect(driveSpeedOf(rig)).toBe(vehicleStatsAt(rig.levels).engine.speedMax)
  })

  it('stays byte-identical across drill purchases, from a starting drill to one past the old floor', () => {
    const before = driveSpeedOf(rigWith({ engine: 5 }))
    for (const drill of [{ drill_power: 1 }, { drill_power: 106, drill_tip: 600 }]) {
      expect(Object.is(driveSpeedOf(rigWith({ engine: 5, ...drill })), before)).toBe(true)
    }
  })

  it('grows by its own exponential curve with no max, x1.05 a purchase', () => {
    for (let step = 0; step < 200; step++) {
      const ratio = engineStatsAtStep(step + 1).speedMax / engineStatsAtStep(step).speedMax
      expect(ratio).toBeCloseTo(1.05, 5)
    }
  })
})

describe('sideways cell time on the scripted clock (ticket 723)', () => {
  it("takes the drive's sub-steps over one metre, rounded up", () => {
    const quantum = DRILL_SUBSTEPS_PER_TICK
    expect(driveSubStepsPerCellOf(6, quantum)).toBe(600)
    expect(driveSubStepsPerCellOf(6.3, quantum)).toBe(Math.ceil((1000 * quantum) / 105))
  })

  it("keeps the drill's sub-steps where the drill is slower, else the drive's", () => {
    const quantum = DRILL_SUBSTEPS_PER_TICK
    expect(sidewaysSubStepsOf(900, 6, quantum)).toBe(900)
    expect(sidewaysSubStepsOf(60, 6, quantum)).toBe(600)
  })
})
