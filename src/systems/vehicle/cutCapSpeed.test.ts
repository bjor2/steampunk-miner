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
import { AIM_STEPS_PER_TURN, UP_VECTOR_SCALE } from '../../constants/physics'
import { AIM, aimDirectionOf, isAlongUpAim, type Aim } from './aim'
import { isDriveCappedAim, isGravityRampedAim } from './cutAxisCaps'
import { FACING, type Facing } from './vehiclePose'
import { newVehicleState, type VehicleState } from './vehicleState'

// Bjor's ruling on #723: sideways cut speed = min(drill rate, drive speed); buying a drill
// upgrade never changes drive speed; downward drilling stays drill-only.

const SIDEWAYS: readonly Facing[] = [FACING.left, FACING.right]
const ALONG_UP: readonly Facing[] = [FACING.down, FACING.up]
const SIDEWAYS_AIMS: readonly Aim[] = [AIM.left, AIM.right]
const ALONG_UP_AIMS: readonly Aim[] = [AIM.down, AIM.up]
const ALL_AIMS: readonly Aim[] = Array.from({ length: AIM_STEPS_PER_TURN }, (_, aim) => aim)
const DIAGONAL_AIMS = ALL_AIMS.filter((aim) => !isAlongUpAim(aim))
const DRIVE = 6

/** The sideways part of a speed along `aim`. */
function sidewaysPartOf(aim: Aim, speed: number): number {
  return (speed * Math.abs(aimDirectionOf(aim).along)) / UP_VECTOR_SCALE
}

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
    for (const aim of SIDEWAYS_AIMS) expect(cappedCutSpeedOf(aim, 84, DRIVE)).toBe(DRIVE)
  })

  it('cuts sideways at the drill rate where the drill is slower', () => {
    for (const aim of SIDEWAYS_AIMS) expect(cappedCutSpeedOf(aim, 4.2, DRIVE)).toBe(4.2)
  })

  it('cuts down and up at the drill rate alone, however slow the drive', () => {
    for (const aim of ALONG_UP_AIMS) expect(cappedCutSpeedOf(aim, 84, DRIVE)).toBe(84)
  })

  it('steps the sideways front no further than the drive, in whole mm rounded up', () => {
    const speedMax = engineStatsAtStep(3).speedMax
    expect(driveStepMmOf(speedMax)).toBe(Math.ceil((speedMax * 1000) / 60))
    expect(cappedCutStepMmOf(AIM.right, 1400, speedMax)).toBe(driveStepMmOf(speedMax))
    expect(cappedCutStepMmOf(AIM.right, 70, speedMax)).toBe(70)
    expect(cappedCutStepMmOf(AIM.down, 1400, speedMax)).toBe(1400)
  })

  it('says a sideways cut is drive-bound only while the drill is faster than the drive', () => {
    expect(isCutDriveBound(AIM.left, 84, DRIVE)).toBe(true)
    expect(isCutDriveBound(AIM.left, DRIVE, DRIVE)).toBe(false)
    expect(isCutDriveBound(AIM.down, 84, DRIVE)).toBe(false)
  })

  // #625: felt speed changes at most 1.5x a cell. The cap is a min, so it never widens the step
  // between two cells' speeds that the drill law already gives.
  it('never makes the speed change between two neighbouring cells larger than the drill does', () => {
    const speeds = Array.from({ length: 40 }, (_, step) => 0.5 * 1.5 ** (step / 4))
    for (const before of speeds) {
      for (const after of speeds) {
        const drillRatio = Math.max(after / before, before / after)
        const capped = [before, after].map((speed) => cappedCutSpeedOf(AIM.right, speed, DRIVE))
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

// Ticket 791, Bjor's rule: sideways drilling, the sideways part of a diagonal cut included, is
// capped by drive speed.
describe('diagonal cut speed under the drive cap (ticket 791)', () => {
  it('holds every aim with a sideways part to the drive, and only those', () => {
    expect(ALL_AIMS.filter(isDriveCappedAim)).toEqual(DIAGONAL_AIMS)
  })

  it('never lets the sideways part of a cut pass the drive speed, at any aim', () => {
    for (const aim of DIAGONAL_AIMS) {
      for (const cutSpeed of [0.5, 4.2, 6, 12, 84]) {
        const sideways = sidewaysPartOf(aim, cappedCutSpeedOf(aim, cutSpeed, DRIVE))
        expect(sideways).toBeLessThanOrEqual(DRIVE * (1 + 1e-12))
      }
    }
  })

  it('cuts a diagonal at the drill rate while its sideways part is under the drive', () => {
    expect(cappedCutSpeedOf(56, 4.2, DRIVE)).toBe(4.2)
    expect(isCutDriveBound(56, 4.2, DRIVE)).toBe(false)
  })

  it('cuts a fast diagonal down-right with its sideways part at exactly the drive speed', () => {
    const speed = cappedCutSpeedOf(56, 84, DRIVE)
    expect(sidewaysPartOf(56, speed)).toBeCloseTo(DRIVE, 9)
    expect(speed).toBeGreaterThan(DRIVE)
    expect(isCutDriveBound(56, 84, DRIVE)).toBe(true)
  })

  it('steps a diagonal front no further sideways than the drive step, rounded up to the mm', () => {
    const speedMax = engineStatsAtStep(3).speedMax
    for (const aim of DIAGONAL_AIMS) {
      const stepMm = cappedCutStepMmOf(aim, 5000, speedMax)
      expect(sidewaysPartOf(aim, stepMm)).toBeLessThan(driveStepMmOf(speedMax) + 1)
    }
  })

  it('ramps every aim with a downward part by local gravity, and only those (#724)', () => {
    expect(ALL_AIMS.filter(isGravityRampedAim)).toEqual(ALL_AIMS.filter((aim) => aim > AIM.left))
  })
})
