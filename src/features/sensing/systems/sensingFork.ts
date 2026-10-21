/**
 * The sensing lane's P16 fork (GD lock on #255, ticket 269): Scout, wide but vague, and Diviner,
 * narrow but exact. Each branch unlocks a charged item of its own, pressed from a power-up slot
 * like the echo sounder, so every ping and every cone read is a use (`PowerUpUsed`): what the
 * lock's metric counts, wide pings per trip against cone reads per cut. Both are reveal only
 * (Vertical Scaler on #157): a use changes nothing in the authority state, and each client draws
 * it from the use (`scoutPing.ts`, `divinerCone.ts`).
 *
 * Only the active branch's item plays: the tree hides an inactive branch's item from the store,
 * and an item still owned from a branch the player switched away from is refused
 * (`sensing.branch_inactive`). The Diviner also warns, while it is the active branch, of what
 * waits in its cone (`passiveReads.ts`).
 *
 * Both branches take the same tier and lane slot through `forkPairOf`, and their items the same
 * one-off price at that tier, so they cost the same on every planet and Mark step for step. Their
 * Marks step cooldown, magnitude (the Scout's radius, the Diviner's cone length) and charges, as
 * the echo sounder's do. Their numbers live in `sensing.economy.json` under `forks`.
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

export const SCOUT_PINGER = 'power.scout_pinger'
export const DIVINER_ROD = 'power.diviner_rod'

export type SensingForkItemId = typeof SCOUT_PINGER | typeof DIVINER_ROD

export const SENSING_FORK_ITEM_IDS: readonly SensingForkItemId[] = [SCOUT_PINGER, DIVINER_ROD]

/** A charged branch item's Mark 1 numbers, in whole ticks. */
export interface ForkChargeBalance {
  charges: number
  cooldownTicks: number
  windupTicks: number
}

export interface ScoutBalance extends ForkChargeBalance {
  /** The ping's radius at Mark 1: the magnitude its Marks grow. */
  radiusTiles: number
  /** The vague grain: one mark per block of this many tiles square. */
  blockTiles: number
}

export interface DivinerBalance extends ForkChargeBalance {
  /** The cone's length at Mark 1: the magnitude its Marks grow. */
  lengthTiles: number
  /** The tangent of the cone's half-angle, in thousandths. */
  halfAngleTanPerMille: number
  /** How long one cone read stays marked. */
  revealTicks: number
}

export interface SensingForkBalance {
  scout: ScoutBalance
  diviner: DivinerBalance
}

export const SENSING_FORK_BALANCE: SensingForkBalance = loadForkBalance(SENSING_ECONOMY_FILE)

const BRANCH_LADDERS: Readonly<Record<SensingForkItemId, MarkLadder>> = {
  [SCOUT_PINGER]: chargedLadderOf(
    SENSING_FORK_BALANCE.scout,
    SENSING_FORK_BALANCE.scout.radiusTiles,
  ),
  [DIVINER_ROD]: chargedLadderOf(
    SENSING_FORK_BALANCE.diviner,
    SENSING_FORK_BALANCE.diviner.lengthTiles,
  ),
}

export const SENSING_FORK: ForkPair = forkPairOf('sensing', [
  {
    branch: 'scout',
    name: 'Scout',
    iconId: 'node-sensing-echo-sounder',
    prereqs: [],
    unlocks: SCOUT_PINGER,
    description: 'A wide pinger: rough shapes far around you fill the map.',
    label: 'horizontal',
    marks: BRANCH_LADDERS[SCOUT_PINGER],
  },
  {
    branch: 'diviner',
    name: 'Diviner',
    iconId: 'node-sensing-threat-periscope',
    prereqs: [],
    unlocks: DIVINER_ROD,
    description: 'A narrow rod read: the cells ahead and what will strike there.',
    label: 'horizontal',
    marks: BRANCH_LADDERS[DIVINER_ROD],
  },
] satisfies [ForkBranchSpec, ForkBranchSpec])

export function isSensingForkItem(itemId: string): itemId is SensingForkItemId {
  return (SENSING_FORK_ITEM_IDS as readonly string[]).includes(itemId)
}

/** Whether the item's branch is the player's active one: only then does the item play. */
export function isBranchActive(state: AuthorityState, playerId: string, itemId: string): boolean {
  return state.players[playerId] !== undefined && researchedMarkOf(state, playerId, itemId) > 0
}

/** The item's magnitude at `mark`; Mark 0, none researched, acts as bought (#249). */
export function forkMagnitudeAt(itemId: SensingForkItemId, mark: number): number {
  return markStepOf(BRANCH_LADDERS[itemId], Math.max(mark, 1)).stats.magnitude ?? 0
}

/** The item's Mark ladder: what each Mark of the branch's item steps. */
export function forkLadderOf(itemId: SensingForkItemId): MarkLadder {
  return BRANCH_LADDERS[itemId]
}

/** The Diviner's cone length now; null unless the Diviner is the player's active branch. */
export function divinerLengthOf(state: AuthorityState, playerId: string): number | null {
  if (!isBranchActive(state, playerId, DIVINER_ROD)) return null
  return forkMagnitudeAt(DIVINER_ROD, researchedMarkOf(state, playerId, DIVINER_ROD))
}

function chargedLadderOf(balance: ForkChargeBalance, magnitude: number): MarkLadder {
  return {
    isIncomeItem: false,
    cooldown: balance.cooldownTicks,
    magnitude: { base: magnitude },
    charges: balance.charges,
  }
}

function loadForkBalance(raw: unknown): SensingForkBalance {
  const reader = createFieldReader()
  const forks = reader.object('forks', reader.object('file', raw).forks)
  const scout = reader.object('forks.scout', forks.scout)
  const diviner = reader.object('forks.diviner', forks.diviner)
  const balance = {
    scout: {
      ...readCharge(reader, 'forks.scout', scout),
      radiusTiles: reader.safeInteger('forks.scout.radiusTiles', scout.radiusTiles),
      blockTiles: reader.safeInteger('forks.scout.blockTiles', scout.blockTiles),
    },
    diviner: {
      ...readCharge(reader, 'forks.diviner', diviner),
      lengthTiles: reader.safeInteger('forks.diviner.lengthTiles', diviner.lengthTiles),
      halfAngleTanPerMille: reader.safeInteger(
        'forks.diviner.halfAngleTanPerMille',
        diviner.halfAngleTanPerMille,
      ),
      revealTicks: reader.safeInteger('forks.diviner.revealTicks', diviner.revealTicks),
    },
  }
  if (reader.problems.length > 0) {
    throw new Error(`sensing.economy.json forks are refused:\n${reader.problems.join('\n')}`)
  }
  return balance
}

function readCharge(
  reader: FieldReader,
  path: string,
  row: Record<string, unknown>,
): ForkChargeBalance {
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    cooldownTicks: reader.safeInteger(`${path}.cooldownTicks`, row.cooldownTicks),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, row.windupTicks),
  }
}
