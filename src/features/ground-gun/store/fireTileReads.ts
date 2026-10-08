/**
 * The fire tile as the local player's replica holds it now: the same pure model on the same
 * state, for the touch tile and the debug reads.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { boreGunStatsOf } from '../systems/boreGunProvider'
import { fireTileOf, type FireTileModel } from '../systems/fireTile'
import { gunLevelsOf } from '../systems/gunLevels'

export function readFireTile(): FireTileModel | null {
  return fireTileOf(readAuthorityState(), useGameStore.getState().playerId)
}

/** How far the local player's gun reaches now, in cells; 0 with no gun. */
export function readGunReachCells(): number {
  const levels = gunLevelsOf(readAuthorityState(), useGameStore.getState().playerId)
  return boreGunStatsOf(levels)?.rangeCells ?? 0
}
