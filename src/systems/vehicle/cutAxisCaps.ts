/**
 * What caps the drill's cut speed on each axis (Bjor's ruling on #723): a sideways cut moves at
 * `min(drill rate, drive speed)`, a cut down or up at the drill's rate alone. A cut down gains that
 * speed no faster than local gravity (Bjor's ruling on #724, `radialGravity.ts`); its top speed
 * stays the drill's. One table feeds both the motion rule (`cutCapSpeed.ts`, `vehicleMotion.ts`)
 * and the drill card's wording, so the card can never say something the rig does not do.
 */
import { FACING, type Facing } from './vehiclePose'

/** The stat that caps a cut: only the drive so far. */
export type CutCapSource = 'drive'

/** What limits how fast a cut gains its speed: only local gravity so far. */
export type CutRampSource = 'localGravity'

export interface CutAxisCap {
  /** The word the card starts its line with. */
  axisName: string
  facings: readonly Facing[]
  /** What holds the cut below the drill's rate; null for the drill alone. */
  cappedBy: CutCapSource | null
  /** What limits the cut's gain of speed; null for the drill's own start ramp alone. */
  rampedBy: CutRampSource | null
}

export const CUT_AXIS_CAPS: readonly CutAxisCap[] = [
  {
    axisName: 'Sideways',
    facings: [FACING.left, FACING.right],
    cappedBy: 'drive',
    rampedBy: null,
  },
  { axisName: 'Downward', facings: [FACING.down], cappedBy: null, rampedBy: 'localGravity' },
  { axisName: 'Upward', facings: [FACING.up], cappedBy: null, rampedBy: null },
]

const CAP_SOURCE_NAMES: Record<CutCapSource, string> = { drive: 'drive speed' }

const RAMP_SOURCE_NAMES: Record<CutRampSource, string> = { localGravity: 'local gravity' }

/** Whether a cut along `facing` is held to the drive's speed. */
export function isDriveCappedFacing(facing: Facing): boolean {
  return capOfFacing(facing)?.cappedBy === 'drive'
}

/** Whether a cut along `facing` gains its speed no faster than local gravity (#724). */
export function isGravityRampedFacing(facing: Facing): boolean {
  return capOfFacing(facing)?.rampedBy === 'localGravity'
}

/**
 * The card's lines from the table, the speed caps then the ramps, each in table order:
 * "Sideways capped by drive speed", "Downward ramp follows local gravity".
 */
export function cutCapLines(): string[] {
  return [...speedCapLines(), ...rampLines()]
}

function speedCapLines(): string[] {
  return CUT_AXIS_CAPS.flatMap(({ axisName, cappedBy }) =>
    cappedBy === null ? [] : [`${axisName} capped by ${CAP_SOURCE_NAMES[cappedBy]}`],
  )
}

function rampLines(): string[] {
  return CUT_AXIS_CAPS.flatMap(({ axisName, rampedBy }) =>
    rampedBy === null ? [] : [`${axisName} ramp follows ${RAMP_SOURCE_NAMES[rampedBy]}`],
  )
}

function capOfFacing(facing: Facing): CutAxisCap | undefined {
  return CUT_AXIS_CAPS.find((cap) => cap.facings.includes(facing))
}
