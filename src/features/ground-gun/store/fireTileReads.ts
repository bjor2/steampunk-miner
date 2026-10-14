/**
 * The fire tile as the local player's replica holds it now: the same pure model on the same
 * state, for the touch tile, the desktop gauge and the debug reads. The lamp is the kernel's
 * auto-shoot reading (ticket 317), null until the steam sear is researched.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { boreGunStatsOf } from '../systems/boreGunProvider'
import { fireTileOf, type FireTileModel } from '../systems/fireTile'
import { gunLevelsOf } from '../systems/gunLevels'
import { boundLabel } from '../../../systems/input/actionMap'
import { boreAutoReadingOf, type BoreAutoReading } from '../../../systems/views/boreAutoReading'
import { FIRE_ACTION } from './fireInput'

export function readFireTile(): FireTileModel | null {
  return fireTileOf(readAuthorityState(), useGameStore.getState().playerId)
}

/** How far the local player's gun reaches now, in cells; 0 with no gun. */
export function readGunReachCells(): number {
  const levels = gunLevelsOf(readAuthorityState(), useGameStore.getState().playerId)
  return boreGunStatsOf(levels)?.rangeCells ?? 0
}

/** What the touch tile and the desktop gauge draw: the ring, the lamp and the fire key. */
export interface GunPanelModel extends FireTileModel {
  /** The auto-shoot lamp, "Auto (T)" and the like; null until the steam sear is researched. */
  lamp: BoreAutoReading | null
  /** The fire key as the player reads it, "Left Mouse" by default. */
  fireKeyText: string
}

/** Null while the gun is not on the miner. */
export function readGunPanel(): GunPanelModel | null {
  const { playerId, bindings } = useGameStore.getState()
  const state = readAuthorityState()
  const tile = fireTileOf(state, playerId)
  if (tile === null) return null
  const lamp = boreAutoReadingOf(state, playerId, bindings)
  return { ...tile, lamp, fireKeyText: boundLabel(bindings, FIRE_ACTION) }
}
