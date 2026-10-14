/**
 * The `tech-tree.forks` save section, v1 (GD lock on #255, ticket 259): per player, the branch
 * each lane's P16 fork has active. A lane that never chose is absent, and a player who chose
 * nothing has no section at all, so no state digest moves until the first choice. Restored by
 * exact version match, never migrated (feature-slices.md 3.13); a save from before it restores
 * with nothing chosen.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import { isTechLane } from './forkIds'
import { activeBranchOf, NO_FORK_CHOICES, type ForkChoices } from './forkNode'
import type { TechLane } from './techNode'

export const FORK_SECTION: SaveSection<ForkChoices> = {
  id: 'tech-tree.forks',
  version: 1,
  scope: 'player',
  initial: NO_FORK_CHOICES,
  problems: forkChoiceProblems,
  toPortable: (choices) => ({ ...choices }),
  ofPortable: (body) => ({ ...(body as ForkChoices) }),
}

export function forkChoicesOf(state: AuthorityState, playerId: string): ForkChoices {
  return readSection(state, playerId, FORK_SECTION)
}

/** The branch the player has active in the lane's fork, or null before the lane chooses. */
export function activeForkBranchOf(
  state: AuthorityState,
  playerId: string,
  lane: TechLane,
): string | null {
  return activeBranchOf(forkChoicesOf(state, playerId), lane)
}

export function withForkChoices(
  state: AuthorityState,
  playerId: string,
  choices: ForkChoices,
): AuthorityState {
  return withSection(state, playerId, FORK_SECTION, choices)
}

function forkChoiceProblems(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return ['tech-tree.forks must be an object of lane to branch']
  }
  return Object.entries(body).flatMap(([lane, branch]) => choiceProblemsOf(lane, branch))
}

function choiceProblemsOf(lane: string, branch: unknown): string[] {
  if (!isTechLane(lane)) return [`tech-tree.forks names no lane ${lane}`]
  return typeof branch === 'string' && branch.length > 0
    ? []
    : [`tech-tree.forks.${lane} must be a branch name`]
}
