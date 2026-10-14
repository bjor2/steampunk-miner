/**
 * The terrain lane's P16 fork (GD lock on #255, ticket 269): Bracer holds ground, Breaker opens
 * it. Neither is built on a terrain magnet or names one: the magnets are their own family (#246).
 * Each branch is a passive the research itself fits: it plays while its branch is the lane's
 * active one, at the Mark researched, with nothing to buy, slot or press. An inactive branch's
 * item is not unlocked (`researchedMarkOf` answers 0), so it reads null here.
 *
 * - **Bracer** props every collapse block that starts to warn round the rig for `propTicks`, its
 *   Mark magnitude (`bracerProps.ts`).
 * - **Breaker** fractures the plain ground just past every charge it blasts, `fractureCells` a
 *   blast, its Mark magnitude, up to the TD's 32-cell activation cap (`breakerFracture.ts`).
 *
 * Both branches take the same tier and lane slot through `forkPairOf`, so they cost the same on
 * every planet and Mark step for step. Their numbers live in `terrain-tools.economy.json` under
 * `forks`.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createFieldReader, type FieldReader } from '../../../systems/economy/economyFieldReader'
import {
  forkPairOf,
  markStepOf,
  researchedMarkOf,
  type ForkBranchSpec,
  type ForkPair,
  type MarkLadder,
} from '../../tech-tree'
import TERRAIN_ECONOMY_FILE from '../terrain-tools.economy.json'

export const BRACER_FRAME = 'passive.bracer_frame'
export const BREAKER_FUSE = 'passive.breaker_fuse'

export interface BracerBalance {
  /** How long a prop holds a warning block at Mark 1: the stat its Marks grow. */
  propTicks: number
}

export interface BreakerBalance {
  /** Density cells one blast fractures at Mark 1: the stat its Marks grow. */
  fractureCells: number
  /** The TD's per-activation cap on a density edit (#162 section 3). */
  fractureCellsLimit: number
  /** How far past the charge's radius the fracture reaches, in whole tiles. */
  ringTiles: number
}

export interface TerrainForkBalance {
  bracer: BracerBalance
  breaker: BreakerBalance
}

export const TERRAIN_FORK_BALANCE: TerrainForkBalance = loadForkBalance(TERRAIN_ECONOMY_FILE)

const BRANCH_LADDERS: Readonly<Record<string, MarkLadder>> = {
  [BRACER_FRAME]: {
    isIncomeItem: false,
    magnitude: { base: TERRAIN_FORK_BALANCE.bracer.propTicks },
  },
  [BREAKER_FUSE]: {
    isIncomeItem: false,
    magnitude: {
      base: TERRAIN_FORK_BALANCE.breaker.fractureCells,
      limit: TERRAIN_FORK_BALANCE.breaker.fractureCellsLimit,
    },
  },
}

export const TERRAIN_FORK: ForkPair = forkPairOf('terrain', [
  {
    branch: 'bracer',
    name: 'Bracer',
    iconId: 'node-terrain-shoring-props',
    prereqs: [],
    unlocks: BRACER_FRAME,
    description: 'Props swing out wherever the rock round you starts to give, and hold it.',
    label: 'horizontal',
    marks: BRANCH_LADDERS[BRACER_FRAME],
  },
  {
    branch: 'breaker',
    name: 'Breaker',
    iconId: 'node-terrain-seam-splitter',
    prereqs: [],
    unlocks: BREAKER_FUSE,
    description: 'Every charge you blast cracks the plain ground just past its reach.',
    label: 'horizontal',
    marks: BRANCH_LADDERS[BREAKER_FUSE],
  },
] satisfies [ForkBranchSpec, ForkBranchSpec])

/** How long a Bracer prop holds now; null unless the Bracer is the player's active branch. */
export function bracerPropTicksOf(state: AuthorityState, playerId: string): number | null {
  return branchMagnitudeOf(state, playerId, BRACER_FRAME)
}

/** Cells a Breaker blast fractures now; null unless the Breaker is the player's active branch. */
export function breakerFractureCellsOf(state: AuthorityState, playerId: string): number | null {
  return branchMagnitudeOf(state, playerId, BREAKER_FUSE)
}

/** The branch item's Mark, 0 while the branch is not active. */
export function branchMarkOf(state: AuthorityState, playerId: string, itemId: string): number {
  return state.players[playerId] === undefined ? 0 : researchedMarkOf(state, playerId, itemId)
}

function branchMagnitudeOf(state: AuthorityState, playerId: string, itemId: string) {
  const mark = branchMarkOf(state, playerId, itemId)
  if (mark === 0) return null
  return markStepOf(BRANCH_LADDERS[itemId], mark).stats.magnitude ?? null
}

function loadForkBalance(raw: unknown): TerrainForkBalance {
  const reader = createFieldReader()
  const forks = reader.object('forks', reader.object('file', raw).forks)
  const balance = {
    bracer: readBracer(reader, reader.object('forks.bracer', forks.bracer)),
    breaker: readBreaker(reader, reader.object('forks.breaker', forks.breaker)),
  }
  if (reader.problems.length > 0) {
    throw new Error(`terrain-tools.economy.json forks are refused:\n${reader.problems.join('\n')}`)
  }
  return balance
}

function readBracer(reader: FieldReader, row: Record<string, unknown>): BracerBalance {
  return { propTicks: reader.safeInteger('forks.bracer.propTicks', row.propTicks) }
}

function readBreaker(reader: FieldReader, row: Record<string, unknown>): BreakerBalance {
  return {
    fractureCells: reader.safeInteger('forks.breaker.fractureCells', row.fractureCells),
    fractureCellsLimit: reader.safeInteger(
      'forks.breaker.fractureCellsLimit',
      row.fractureCellsLimit,
    ),
    ringTiles: reader.safeInteger('forks.breaker.ringTiles', row.ringTiles),
  }
}
