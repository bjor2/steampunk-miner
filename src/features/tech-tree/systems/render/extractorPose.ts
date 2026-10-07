/**
 * The fold-flat rule (G&V feel pass on #162, GD approved 6 Oct): an idle extractor sits folded
 * against the hull, deploys over at most `unfoldTicks` while the drill works a gated cell of its
 * family, and folds back `holdTicks` after the cell is left. The same blend poses any gear part
 * with a folded and a deployed pose (the corer's tube, the boom's sleeve, the flank cutters).
 * Pure: the scene passes the work the mining-gates slice read off the state (`extractorWorkOf`,
 * ticket 297).
 */
import { DEPLOY_TIMING, type DeployTiming, type GearPart, type PartPose } from './techGear'

const AT_REST: PartPose = { turn: 0, shift: [0, 0] }

/** The shape of mining-gates' `ExtractorWork`: whether the verb works and for how many ticks. */
export interface DeployWork {
  isWorking: boolean
  ticksSinceChange: number
}

/**
 * How far deployed, 0 (folded) to 1 (working): rising while it works over the ticks since the
 * work began, held for `holdTicks` after it stopped, then falling over `foldTicks`. Gear that has
 * not worked (null) sits folded.
 */
export function deployFractionOf(
  work: DeployWork | null,
  timing: DeployTiming = DEPLOY_TIMING,
): number {
  if (work === null) return 0
  return work.isWorking
    ? clampUnit(work.ticksSinceChange / timing.unfoldTicks)
    : 1 - clampUnit((work.ticksSinceChange - timing.holdTicks) / timing.foldTicks)
}

/** The part's pose at `fraction` deployed; a part with no poses stays at rest. */
export function partPoseAt(part: GearPart, fraction: number): PartPose {
  const folded = part.folded ?? AT_REST
  const deployed = part.deployed ?? folded
  const blend = smoothstep(clampUnit(fraction))
  return {
    turn: mix(folded.turn, deployed.turn, blend),
    shift: [
      mix(folded.shift[0], deployed.shift[0], blend),
      mix(folded.shift[1], deployed.shift[1], blend),
    ],
  }
}

export function isMovingPart(part: GearPart): boolean {
  return part.folded !== undefined && part.deployed !== undefined
}

function mix(from: number, to: number, blend: number): number {
  return from + (to - from) * blend
}

/** Eases both ends so a deploy reads as a mechanism settling, not a snap. */
function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}
