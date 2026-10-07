/**
 * What a bought step lands as on the showcase (#180 section 3, "three tiers of reward"): a rivet
 * pip, an ordinary big level-up, or a milestone big level-up, which ends a held chain with the full
 * moment (Progression rule 5). Which majors are milestones is data from the milestone list
 * (#228, keyed on track and major L); the GD lock on #177 ships this slice with an empty list, so
 * every major is ordinary until that list is handed in here.
 *
 * A milestone's part swap shows from the step that lands it on: the parts of the highest milestone
 * a track owns are drawn in their slots.
 */
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import { isMajorStep, majorOf } from '../../../systems/economy/upgradeSteps'
import type { UpgradeLevels } from '../../../systems/economy/vehicleStats'
import type { StepLanding } from './holdChain'

/** One milestone row: the track's major L that is a milestone and the parts it swaps in. */
export interface MilestoneMajor {
  track: UpgradeId
  major: number
  /** Parts of the `vehicle` asset the milestone draws in their slots; empty for a motion only. */
  partIds: readonly string[]
}

/** #177 ships with an empty list (GD lock, Q2): every major is ordinary. */
export const NO_MILESTONES: readonly MilestoneMajor[] = []

/** What buying one step from `fromStep` on this track lands as. */
export function landingOf(
  track: UpgradeId,
  fromStep: number,
  milestones: readonly MilestoneMajor[] = NO_MILESTONES,
): StepLanding {
  if (!isMajorStep(fromStep)) return 'pip'
  const reached = majorOf(fromStep) + 1
  return isMilestoneMajor(track, reached, milestones) ? 'milestone' : 'major'
}

/** The parts every track's highest owned milestone swaps in, in track order. */
export function ownedSwapPartIdsOf(
  levels: UpgradeLevels,
  milestones: readonly MilestoneMajor[] = NO_MILESTONES,
): string[] {
  const tracks = [...new Set(milestones.map((row) => row.track))]
  return tracks.flatMap((track) => highestOwnedOf(track, majorOf(levels[track]), milestones))
}

function isMilestoneMajor(
  track: UpgradeId,
  major: number,
  milestones: readonly MilestoneMajor[],
): boolean {
  return milestones.some((row) => row.track === track && row.major === major)
}

function highestOwnedOf(
  track: UpgradeId,
  majorOwned: number,
  milestones: readonly MilestoneMajor[],
): readonly string[] {
  const owned = milestones.filter((row) => row.track === track && row.major <= majorOwned)
  const highest = owned.reduce<MilestoneMajor | null>(
    (best, row) => (best === null || row.major > best.major ? row : best),
    null,
  )
  return highest?.partIds ?? []
}
