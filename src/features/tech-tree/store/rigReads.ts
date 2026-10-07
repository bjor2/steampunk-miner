/**
 * The rig as the local player's replica holds it now (ticket 250): the mounted items the vehicle
 * piece draws and the debug read reports, each at the Mark it acts at (#249), from the same rule
 * on the same state.
 */
import { readAuthorityState } from '../../../store/authorityLink'
import { useGameStore } from '../../../store/gameStore'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { ArtCatalogue } from '../../../systems/art/artCatalogue'
import { actingMarksOf, BOUGHT_MARK } from '../systems/render/markPlate'
import { rigItemsOf } from '../systems/render/rigGear'
import { rigSightOf, type RigSight } from '../systems/render/rigSight'
import type { MountedItem } from '../systems/render/techGearQuads'
import { registeredTechTree } from '../systems/techTree'
import { unlockedItems } from '../systems/unlockRules'

/** What the rig carries: its mounted items and the Mark each acts at. */
export interface CarriedRig {
  items: MountedItem[]
  marks: Readonly<Record<string, number>>
}

export function readCarriedRig(): CarriedRig {
  const state = readAuthorityState()
  const { playerId } = useGameStore.getState()
  const items = rigItemsOf(vehicleOf(state, playerId).loadout)
  return { items, marks: actingMarksOfRig(state, playerId, items) }
}

/** One string, so the piece renders again only when the items or a Mark change. */
export function readCarriedRigKey(): string {
  return JSON.stringify(readCarriedRig())
}

export function carriedRigOfKey(rigKey: string): CarriedRig {
  return JSON.parse(rigKey) as CarriedRig
}

/** What the rig shows: the gear at its points and every plate at the Mark its item acts at. */
export function rigSightOfCarried(art: ArtCatalogue, rig: CarriedRig): RigSight {
  const markOf = (itemId: string) => rig.marks[itemId] ?? BOUGHT_MARK
  return rigSightOf(art, rig.items, registeredTechTree(), markOf)
}

/** No items, no tree walk: the selector runs on every store change. */
function actingMarksOfRig(state: AuthorityState, playerId: string, items: readonly MountedItem[]) {
  return items.length === 0 ? {} : actingMarksOf(items, unlockedItems(state, playerId))
}
