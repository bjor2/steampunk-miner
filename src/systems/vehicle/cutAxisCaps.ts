/**
 * What caps the drill's cut speed on each axis (Bjor's ruling on #723): a sideways cut moves at
 * `min(drill rate, drive speed)`, a cut down or up at the drill's rate alone. One table feeds both
 * the motion rule (`cutCapSpeed.ts`) and the drill card's wording, so the card can never say
 * something the rig does not do.
 */
import { FACING, type Facing } from './vehiclePose'

/** The stat that caps a cut: only the drive so far. */
export type CutCapSource = 'drive'

export interface CutAxisCap {
  /** The word the card starts its line with. */
  axisName: string
  facings: readonly Facing[]
  /** What holds the cut below the drill's rate; null for the drill alone. */
  cappedBy: CutCapSource | null
}

export const CUT_AXIS_CAPS: readonly CutAxisCap[] = [
  { axisName: 'Sideways', facings: [FACING.left, FACING.right], cappedBy: 'drive' },
  { axisName: 'Downward', facings: [FACING.down], cappedBy: null },
  { axisName: 'Upward', facings: [FACING.up], cappedBy: null },
]

const CAP_SOURCE_NAMES: Record<CutCapSource, string> = { drive: 'drive speed' }

/** Whether a cut along `facing` is held to the drive's speed. */
export function isDriveCappedFacing(facing: Facing): boolean {
  return capOfFacing(facing)?.cappedBy === 'drive'
}

/** One card line per capped axis, "Sideways capped by drive speed", in table order. */
export function cutCapLines(): string[] {
  return CUT_AXIS_CAPS.flatMap(({ axisName, cappedBy }) =>
    cappedBy === null ? [] : [cutCapLineOf(axisName, cappedBy)],
  )
}

function cutCapLineOf(axisName: string, cappedBy: CutCapSource): string {
  return `${axisName} capped by ${CAP_SOURCE_NAMES[cappedBy]}`
}

function capOfFacing(facing: Facing): CutAxisCap | undefined {
  return CUT_AXIS_CAPS.find((cap) => cap.facings.includes(facing))
}
