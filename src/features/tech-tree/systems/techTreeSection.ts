/**
 * The `techTree` save section, v1 (spec #161 section 5): per player, the ids of the nodes they
 * researched, sorted. Generated ids are formulas of an item id and N, or of `p`, so they stay
 * stable across versions of the authored content. Restored by exact version match, never
 * migrated (feature-slices.md 3.13).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'

export interface TechTreeProgress {
  /** Researched node ids, sorted, each once. */
  unlocked: readonly string[]
}

const NOTHING_RESEARCHED: TechTreeProgress = { unlocked: [] }

export const TECH_TREE_SECTION: SaveSection<TechTreeProgress> = {
  id: 'tech-tree',
  version: 1,
  scope: 'player',
  initial: NOTHING_RESEARCHED,
  problems: progressProblems,
  toPortable: (progress) => ({ unlocked: [...progress.unlocked] }),
  ofPortable: (body) => ({ unlocked: [...(body as TechTreeProgress).unlocked] }),
}

export function unlockedNodeIdsOf(state: AuthorityState, playerId: string): readonly string[] {
  return readSection(state, playerId, TECH_TREE_SECTION).unlocked
}

/** The player's progress with `nodeIds` researched too. */
export function withNodesUnlocked(
  state: AuthorityState,
  playerId: string,
  nodeIds: readonly string[],
): AuthorityState {
  const unlocked = [...new Set([...unlockedNodeIdsOf(state, playerId), ...nodeIds])].sort()
  return withSection(state, playerId, TECH_TREE_SECTION, { unlocked })
}

function progressProblems(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return ['techTree must be an object']
  const { unlocked } = body as { unlocked?: unknown }
  if (!Array.isArray(unlocked)) return ['techTree.unlocked must be a list of node ids']
  return [...nonTextIdProblems(unlocked), ...unsortedIdProblems(unlocked)]
}

function nonTextIdProblems(unlocked: readonly unknown[]): string[] {
  return unlocked.some((id) => typeof id !== 'string')
    ? ['techTree.unlocked holds only node ids']
    : []
}

function unsortedIdProblems(unlocked: readonly unknown[]): string[] {
  const isStrictlySorted = unlocked.every(
    (id, index) => index === 0 || String(unlocked[index - 1]) < String(id),
  )
  return isStrictlySorted ? [] : ['techTree.unlocked must be sorted, each id once']
}
