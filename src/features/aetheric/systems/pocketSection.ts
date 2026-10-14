/**
 * Each player's open slow pocket (the `aetheric.pocket` save section v1, #263): the cell the
 * governor was pressed on, how far round it enemies are slowed, its last tick, and the last tick
 * the tank has paid for. It is world state kept in the authority, so every machine slows the same
 * enemies (design principle 37.6), whoever's vehicle they hunt. A new pocket replaces the old one;
 * the pocket clock clears it when it ends, so the section goes back to its initial value, out of
 * the state and the digest. Every field is a safe integer or, for still foam's blocks (ticket 373),
 * a list of block ids, so the portable form is the value.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'

/**
 * A pocket round tile (`tx`, `ty`), `reachMm` from its centre, slowing enemies from the tick after
 * it opened through `lastTick`, as long as the tank has paid through `paidThroughTick`.
 */
export interface SlowPocket {
  tx: number
  ty: number
  reachMm: number
  lastTick: number
  paidThroughTick: number
  /**
   * The collapse blocks still foam laid in the pocket carries it onto (ticket 373), sorted ids;
   * absent until the combo stills foam, so no save or digest changes without it.
   */
  stilledBlocks?: readonly string[]
}

export interface PocketState {
  pocket: SlowPocket | null
}

export const CLOSED: PocketState = { pocket: null }

export const POCKET_SECTION: SaveSection<PocketState> = {
  id: 'aetheric.pocket',
  version: 1,
  scope: 'player',
  initial: CLOSED,
  problems: pocketStateProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as PocketState,
}

export function pocketOf(state: AuthorityState, playerId: string): PocketState {
  return readSection(state, playerId, POCKET_SECTION)
}

export function withPocket(
  state: AuthorityState,
  playerId: string,
  pocket: PocketState,
): AuthorityState {
  return withSection(state, playerId, POCKET_SECTION, pocket)
}

const POCKET_FIELDS = ['tx', 'ty', 'reachMm', 'lastTick', 'paidThroughTick'] as const

function pocketStateProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['aetheric.pocket must be an object']
  if (body.pocket === null) return []
  if (!isJsonObject(body.pocket)) return ['aetheric.pocket.pocket must be an object or null']
  const pocket = body.pocket
  return [
    ...POCKET_FIELDS.filter((field) => !Number.isSafeInteger(pocket[field])).map(
      (field) => `aetheric.pocket.pocket.${field} must be a safe integer`,
    ),
    ...stilledBlocksProblems(pocket.stilledBlocks),
  ]
}

function stilledBlocksProblems(blocks: unknown): string[] {
  if (blocks === undefined) return []
  const isBlockList = Array.isArray(blocks) && blocks.every((block) => typeof block === 'string')
  return isBlockList ? [] : ['aetheric.pocket.pocket.stilledBlocks must be a list of block ids']
}
