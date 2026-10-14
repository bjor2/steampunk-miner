/**
 * The sensing lane's P16 fork (GD lock on #255, ticket 269): Scout, wide but vague, and Diviner,
 * narrow but exact. Each branch is a passive the research itself fits: it plays while its branch
 * is the lane's active one, at the Mark researched, with nothing to buy, slot or press. An
 * inactive branch's item is not unlocked (`researchedMarkOf` answers 0), so it reads null here.
 *
 * Both branches take the same tier and lane slot through `forkPairOf`, so they cost the same on
 * every planet and Mark step for step. Their Marks grow one number each: the Scout's ping radius
 * and the Diviner's cone length, up to twice the base like the other sensing passives. Neither
 * card or effect names a schedule row or an ore family; both reveal only (Vertical Scaler on
 * #157), as every sensing item does. Their numbers live in `sensing.economy.json` under `forks`.
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
import SENSING_ECONOMY_FILE from '../sensing.economy.json'

export const SCOUT_PINGER = 'passive.scout_pinger'
export const DIVINER_ROD = 'passive.diviner_rod'

export interface ScoutBalance {
  /** The ping's radius at Mark 1: the stat its Marks grow. */
  radiusTiles: number
  /** One ping each time the authority clock passes a multiple of this, out of the dock. */
  pingEveryTicks: number
  /** The vague grain: one mark per block of this many tiles square. */
  blockTiles: number
}

export interface DivinerBalance {
  /** The cone's length at Mark 1: the stat its Marks grow. */
  lengthTiles: number
  /** The tangent of the cone's half-angle, in thousandths. */
  halfAngleTanPerMille: number
  /** How long one cut's cone read stays marked. */
  revealTicks: number
}

export interface SensingForkBalance {
  scout: ScoutBalance
  diviner: DivinerBalance
}

export const SENSING_FORK_BALANCE: SensingForkBalance = loadForkBalance(SENSING_ECONOMY_FILE)

const BRANCH_LADDERS: Readonly<Record<string, MarkLadder>> = {
  [SCOUT_PINGER]: ladderOf(SENSING_FORK_BALANCE.scout.radiusTiles),
  [DIVINER_ROD]: ladderOf(SENSING_FORK_BALANCE.diviner.lengthTiles),
}

export const SENSING_FORK: ForkPair = forkPairOf('sensing', [
  {
    branch: 'scout',
    name: 'Scout',
    iconId: 'node-sensing-echo-sounder',
    prereqs: [],
    unlocks: SCOUT_PINGER,
    description: 'A wide pinger on its own clock: rough shapes far around you fill the map.',
    label: 'horizontal',
    marks: BRANCH_LADDERS[SCOUT_PINGER],
  },
  {
    branch: 'diviner',
    name: 'Diviner',
    iconId: 'node-sensing-threat-periscope',
    prereqs: [],
    unlocks: DIVINER_ROD,
    description: 'A narrow rod read with each cut: the exact cells ahead, and what waits there.',
    label: 'horizontal',
    marks: BRANCH_LADDERS[DIVINER_ROD],
  },
] satisfies [ForkBranchSpec, ForkBranchSpec])

/** The Scout's ping radius now; null unless the Scout is the player's active branch. */
export function scoutRadiusOf(state: AuthorityState, playerId: string): number | null {
  return branchMagnitudeOf(state, playerId, SCOUT_PINGER)
}

/** The Diviner's cone length now; null unless the Diviner is the player's active branch. */
export function divinerLengthOf(state: AuthorityState, playerId: string): number | null {
  return branchMagnitudeOf(state, playerId, DIVINER_ROD)
}

/** The branch item's magnitude at the Mark researched; null while the branch is not active. */
function branchMagnitudeOf(state: AuthorityState, playerId: string, itemId: string) {
  if (state.players[playerId] === undefined) return null
  const mark = researchedMarkOf(state, playerId, itemId)
  if (mark === 0) return null
  return markStepOf(BRANCH_LADDERS[itemId], mark).stats.magnitude ?? null
}

/** A reveal-only passive: one magnitude, grown to twice its base by the rotation. */
function ladderOf(base: number): MarkLadder {
  return { isIncomeItem: false, magnitude: { base } }
}

function loadForkBalance(raw: unknown): SensingForkBalance {
  const reader = createFieldReader()
  const forks = reader.object('forks', reader.object('file', raw).forks)
  const balance = {
    scout: readScout(reader, reader.object('forks.scout', forks.scout)),
    diviner: readDiviner(reader, reader.object('forks.diviner', forks.diviner)),
  }
  if (reader.problems.length > 0) {
    throw new Error(`sensing.economy.json forks are refused:\n${reader.problems.join('\n')}`)
  }
  return balance
}

function readScout(reader: FieldReader, row: Record<string, unknown>): ScoutBalance {
  return {
    radiusTiles: reader.safeInteger('forks.scout.radiusTiles', row.radiusTiles),
    pingEveryTicks: reader.safeInteger('forks.scout.pingEveryTicks', row.pingEveryTicks),
    blockTiles: reader.safeInteger('forks.scout.blockTiles', row.blockTiles),
  }
}

function readDiviner(reader: FieldReader, row: Record<string, unknown>): DivinerBalance {
  return {
    lengthTiles: reader.safeInteger('forks.diviner.lengthTiles', row.lengthTiles),
    halfAngleTanPerMille: reader.safeInteger(
      'forks.diviner.halfAngleTanPerMille',
      row.halfAngleTanPerMille,
    ),
    revealTicks: reader.safeInteger('forks.diviner.revealTicks', row.revealTicks),
  }
}
