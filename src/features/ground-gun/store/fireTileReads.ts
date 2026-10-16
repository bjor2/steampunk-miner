/**
 * The fire tile as the local player's replica holds it now: the same pure model on the same
 * state, for the touch tile, the desktop gauge and the debug reads. The lamp is the kernel's
 * auto-shoot reading (ticket 317), null until the steam sear is researched.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { playerBoreGunOf } from '../systems/boreGunProvider'
import { fireTileOf, type FireTileModel } from '../systems/fireTile'
import { gunLevelsOf, isGunMounted } from '../systems/gunLevels'
import { promptLabelOf, promptSourceOf } from '../../../systems/input/promptLabel'
import { boreAutoReadingOf, type BoreAutoReading } from '../../../systems/views/boreAutoReading'
import { FIRE_ACTION } from './fireInput'

export function readFireTile(): FireTileModel | null {
  return fireTileOf(readAuthorityState(), useGameStore.getState().playerId)
}

/** Whether the local player's gun is on the rig, so its mount shows there (ticket 315). */
export function readIsGunMounted(): boolean {
  return isGunMounted(gunLevelsOf(readAuthorityState(), useGameStore.getState().playerId))
}

/** How far the local player's gun reaches now, in cells; 0 with no gun. */
export function readGunReachCells(): number {
  return playerBoreGunOf(readAuthorityState(), useGameStore.getState().playerId)?.rangeCells ?? 0
}

/** What the touch tile and the desktop gauge draw: the ring, the lamp and the fire key. */
export interface GunPanelModel extends FireTileModel {
  /** The auto-shoot lamp, "Auto (T)" and the like; null until the steam sear is researched. */
  lamp: BoreAutoReading | null
  /** The fire control as the player reads it: "Left Mouse" by default, "fire tile" on touch. */
  fireKeyText: string
}

/** Null while the gun is not on the miner. */
export function readGunPanel(): GunPanelModel | null {
  const game = useGameStore.getState()
  const state = readAuthorityState()
  const tile = fireTileOf(state, game.playerId)
  if (tile === null) return null
  const prompts = promptSourceOf(game)
  const lamp = boreAutoReadingOf(state, game.playerId, prompts)
  return { ...tile, lamp, fireKeyText: promptLabelOf(FIRE_ACTION, prompts, prompts.inputDevice) }
}
