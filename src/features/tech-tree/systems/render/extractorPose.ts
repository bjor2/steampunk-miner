/**
 * The fold-flat rule (G&V feel pass on #162, GD approved 6 Oct): an idle extractor sits folded
 * against the hull, deploys over at most `unfoldTicks` while the drill works a gated cell of its
 * family, and folds back `holdTicks` after the cell is left. The same blend poses any gear part
 * with a folded and a deployed pose (the corer's tube, the boom's sleeve, the flank cutters).
 * Pure: the scene passes the ticks it counted.
 */
import { DEPLOY_TIMING, type DeployTiming, type GearPart, type PartPose } from './techGear'

const AT_REST: PartPose = { turn: 0, shift: [0, 0] }

/**
 * How far deployed, 0 (folded) to 1 (working): rising while `isWorking` over the ticks since the
 * work began, held for `holdTicks` after it stopped, then falling over `foldTicks`.
 */
export function deployFractionOf(
  isWorking: boolean,
  ticksSinceChange: number,
  timing: DeployTiming = DEPLOY_TIMING,
): number {
  return isWorking
    ? clampUnit(ticksSinceChange / timing.unfoldTicks)
    : 1 - clampUnit((ticksSinceChange - timing.holdTicks) / timing.foldTicks)
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
