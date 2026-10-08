/**
 * The collapse part of the session snapshot (#43 Authority and multiplayer): the warning list
 * `{block, startTick}` is plain JSON already, so it travels as it is and a load mid-warning fires
 * the collapse on the same tick. A braced entry carries `isBraced: true` (ticket 331), so a join or
 * a replay mid-brace keeps the brace; an older save has none and loads unbraced. Reading checks
 * the shape; the digest check in `sessionSnapshot.ts` catches wrong values.
 */
import { blockOfId } from '../../world/collapseBlock'
import { isJsonObject, isWholeNumber } from '../payloadFields'
import type { CollapseState, CollapsingBlock } from './collapseState'

export function portableCollapseOf(collapse: CollapseState): CollapseState {
  return { blocks: collapse.blocks.map((entry) => ({ ...entry })) }
}

export function portableCollapseProblems(collapse: unknown, path: string): string[] {
  if (!isJsonObject(collapse) || !Array.isArray(collapse.blocks)) {
    return [`${path} must hold a list of blocks`]
  }
  return collapse.blocks
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !isCollapsingBlock(entry))
    .map(({ index }) => `${path}.blocks[${index}] is malformed`)
}

function isCollapsingBlock(entry: unknown): entry is CollapsingBlock {
  return (
    isJsonObject(entry) &&
    typeof entry.block === 'string' &&
    blockOfId(entry.block) !== null &&
    isWholeNumber(entry.startTick) &&
    typeof entry.isForced === 'boolean' &&
    isBraceBit(entry.isBraced)
  )
}

/** Absent, or `true`: the bit is never written false. */
function isBraceBit(isBraced: unknown): boolean {
  return isBraced === undefined || isBraced === true
}
