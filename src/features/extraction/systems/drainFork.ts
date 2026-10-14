/**
 * What the extraction fork's active branch changes in a mineral drain (GD lock on #255, ticket
 * 269), read once as the channel ends: the Hauler's and the Prospector's extra reach, the Hauler's
 * extra cells a use, and the Prospector's choice of only the best grade in reach. With neither
 * branch active every number is the drain's own and every cell stays in its order.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DrainableCell } from './drainReach'
import { haulerBonusOf, isProspecting, prospectorReachBonusOf } from './extractionFork'

/** The whole cells the active branch adds to the drain's radius; 0 with none. */
export function forkReachBonusOf(state: AuthorityState, playerId: string): number {
  return haulerBonusOf(state, playerId) + prospectorReachBonusOf(state, playerId)
}

/** The cells a use takes, with the Hauler's extra cells when it is the active branch. */
export function forkCellsPerUseOf(state: AuthorityState, playerId: string, cells: number): number {
  return cells + haulerBonusOf(state, playerId)
}

/** The cells the drain may take: all of them, or the Prospector's best grade alone, in order. */
export function forkChosenCellsOf(
  state: AuthorityState,
  playerId: string,
  cells: readonly DrainableCell[],
): readonly DrainableCell[] {
  return isProspecting(state, playerId) ? bestGradeCellsOf(cells) : cells
}

/** Only the cells whose unit sells at the best sale tier among them, in their order. */
export function bestGradeCellsOf(cells: readonly DrainableCell[]): DrainableCell[] {
  const best = Math.max(...cells.map((cell) => cell.ore.saleTier))
  return cells.filter((cell) => cell.ore.saleTier === best)
}
