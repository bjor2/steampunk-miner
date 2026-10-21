/**
 * The extraction lane's P16 fork (GD lock on #255, ticket 269): Hauler takes volume, Prospector
 * takes selection, both through the mineral drain. Each branch is a passive the research itself
 * fits: it plays while its branch is the lane's active one, at the Mark researched, with nothing
 * to buy, slot or press. An inactive branch's item is not unlocked (`researchedMarkOf` answers 0).
 *
 * - **Hauler**: the drain reaches further and takes as many more cells a use, its Mark magnitude
 *   in whole cells; more of the hold arrives by reach than by the bit.
 * - **Prospector**: the drain reads further, its Mark magnitude, and takes only the cells of the
 *   best grade in reach, best value first, leaving the rest for the bit.
 *
 * **Hauler is held.** It moves ore income, so it stays unregistered and unseen until the 15%
 * income-cap check (#385) merges (GD ruling on #212, 14 Oct). Its node is built here but only
 * Prospector's joins the lane's nodes (`SHIPPED_EXTRACTION_FORK_NODES`); with no Hauler node in
 * the tree no player can choose it, so its Mark is 0 and the drain plays as without it.
 *
 * Both branches take the same tier and lane slot through `forkPairOf`, so they cost the same on
 * every planet. Their numbers live in `extraction.economy.json` under `forks`.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createFieldReader } from '../../../systems/economy/economyFieldReader'
import {
  forkPairOf,
  markStepOf,
  researchedMarkOf,
  type ForkBranchSpec,
  type ForkNode,
  type ForkPair,
  type MarkLadder,
} from '../../tech-tree'
import EXTRACTION_ECONOMY_FILE from '../extraction.economy.json'

export const HAULER_HOPPER = 'passive.hauler_hopper'
export const PROSPECTOR_SIEVE = 'passive.prospector_sieve'

export interface ExtractionForkBalance {
  /** The Hauler's reach and cells-per-use bonus at Mark 1: the stat its Marks grow. */
  haulerReachBonusTiles: number
  /** The Prospector's reach bonus at Mark 1: the stat its Marks grow. */
  prospectorReachBonusTiles: number
}

export const EXTRACTION_FORK_BALANCE: ExtractionForkBalance =
  loadForkBalance(EXTRACTION_ECONOMY_FILE)

const BRANCH_LADDERS: Readonly<Record<string, MarkLadder>> = {
  [HAULER_HOPPER]: {
    isIncomeItem: true,
    magnitude: { base: EXTRACTION_FORK_BALANCE.haulerReachBonusTiles },
  },
  [PROSPECTOR_SIEVE]: {
    isIncomeItem: false,
    magnitude: { base: EXTRACTION_FORK_BALANCE.prospectorReachBonusTiles },
  },
}

export const EXTRACTION_FORK: ForkPair = forkPairOf('extraction', [
  {
    branch: 'hauler',
    name: 'Hauler',
    iconId: 'node-extraction-containment-hood',
    prereqs: [],
    unlocks: HAULER_HOPPER,
    description: 'A wider hopper on the drain: it reaches further and pulls more ore each use.',
    label: 'horizontal',
    marks: BRANCH_LADDERS[HAULER_HOPPER],
  },
  {
    branch: 'prospector',
    name: 'Prospector',
    iconId: 'item-passive-assay-lens',
    prereqs: [],
    unlocks: PROSPECTOR_SIEVE,
    description: 'A sieve on the drain takes only the richest grade of ore.',
    label: 'horizontal',
    marks: BRANCH_LADDERS[PROSPECTOR_SIEVE],
  },
] satisfies [ForkBranchSpec, ForkBranchSpec])

const [HAULER_NODE, PROSPECTOR_NODE] = EXTRACTION_FORK.branches

/** Held until #385 merges: an income mover is never player-visible before its 15% check. */
export const HELD_EXTRACTION_FORK_NODES: readonly ForkNode[] = [HAULER_NODE]

/** The fork branches the lane registers: Prospector alone while the Hauler is held. */
export const SHIPPED_EXTRACTION_FORK_NODES: readonly ForkNode[] = [PROSPECTOR_NODE]

/** The Hauler's extra reach and cells a use; 0 unless the Hauler is the player's active branch. */
export function haulerBonusOf(state: AuthorityState, playerId: string): number {
  return branchBonusAt(HAULER_HOPPER, researchedMarkOf(state, playerId, HAULER_HOPPER))
}

/** The Prospector's extra reach; 0 unless the Prospector is the player's active branch. */
export function prospectorReachBonusOf(state: AuthorityState, playerId: string): number {
  return branchBonusAt(PROSPECTOR_SIEVE, researchedMarkOf(state, playerId, PROSPECTOR_SIEVE))
}

export function isProspecting(state: AuthorityState, playerId: string): boolean {
  return researchedMarkOf(state, playerId, PROSPECTOR_SIEVE) > 0
}

/** A branch item's bonus at `mark`: its ladder's magnitude, 0 at Mark 0 (not active). */
export function branchBonusAt(itemId: string, mark: number): number {
  if (mark === 0) return 0
  return markStepOf(BRANCH_LADDERS[itemId], mark).stats.magnitude ?? 0
}

function loadForkBalance(raw: unknown): ExtractionForkBalance {
  const reader = createFieldReader()
  const forks = reader.object('forks', reader.object('file', raw).forks)
  const hauler = reader.object('forks.hauler', forks.hauler)
  const prospector = reader.object('forks.prospector', forks.prospector)
  const balance = {
    haulerReachBonusTiles: reader.safeInteger(
      'forks.hauler.reachBonusTiles',
      hauler.reachBonusTiles,
    ),
    prospectorReachBonusTiles: reader.safeInteger(
      'forks.prospector.reachBonusTiles',
      prospector.reachBonusTiles,
    ),
  }
  if (reader.problems.length > 0) {
    throw new Error(`extraction.economy.json forks are refused:\n${reader.problems.join('\n')}`)
  }
  return balance
}
