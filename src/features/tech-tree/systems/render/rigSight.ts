/**
 * What the rig shows from a loadout's mounted items (ticket 250): the gear at its points and a
 * Mark plate on every cradle that holds a Mark-bearing item. One rule for the vehicle piece and
 * the debug read, so a spec reads what the car draws.
 */
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import type { TechTree } from '../techTree'
import { cradleMarksOf, markPlatesOf, type MarkPlate } from './markPlate'
import { rigMountsOf, rigSidecarOf, type RigMount } from './rigGear'
import type { MountedItem } from './techGearQuads'

export interface RigSight {
  mounts: RigMount[]
  plates: MarkPlate[]
}

const NO_RIG: RigSight = { mounts: [], plates: [] }

export function rigSightOf(
  art: ArtCatalogue,
  items: readonly MountedItem[],
  tree: TechTree,
  markOf: (itemId: string) => number,
): RigSight {
  const vehicle = rigSidecarOf(art)
  if (vehicle === null) return NO_RIG
  const mounts = rigMountsOf(art, vehicle, items)
  return { mounts, plates: markPlatesOf(vehicle, mounts, cradleMarksOf(items, tree, markOf)) }
}
