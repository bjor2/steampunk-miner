/**
 * The rig as the local player's replica holds it now (ticket 250): the mounted items the vehicle
 * piece draws and the debug read reports, from the same rule on the same state.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { ArtCatalogue } from '../../../systems/art/artCatalogue'
import { MARK_UNTIL_MARKS_ACT } from '../systems/render/markPlate'
import { rigItemsOf } from '../systems/render/rigGear'
import { rigSightOf, type RigSight } from '../systems/render/rigSight'
import type { MountedItem } from '../systems/render/techGearQuads'
import { registeredTechTree } from '../systems/techTree'

export function readRigItems(): MountedItem[] {
  const state = readAuthorityState()
  return rigItemsOf(vehicleOf(state, useGameStore.getState().playerId).loadout)
}

/** One string, so the piece renders again only when what the rig carries changes. */
export function readRigKey(): string {
  return JSON.stringify(readRigItems())
}

export function rigItemsOfKey(rigKey: string): MountedItem[] {
  return JSON.parse(rigKey) as MountedItem[]
}

/** What the rig shows for these items; every plate at the Mark items act at (#249). */
export function rigSightOfItems(art: ArtCatalogue, items: readonly MountedItem[]): RigSight {
  return rigSightOf(art, items, registeredTechTree(), () => MARK_UNTIL_MARKS_ACT)
}
