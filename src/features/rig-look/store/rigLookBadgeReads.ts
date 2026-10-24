/**
 * The finish badges the local rig shows now (ticket 809), read from the authority replica: the
 * scene asks for a short key every store update and builds the badges again only when it changes,
 * so a frame allocates nothing and a purchase inside a band draws nothing new.
 */
import { readLocalVehicle } from '../../../store/gameStore'
import type { ArtCatalogue } from '../../../systems/art/artCatalogue'
import { visualTier } from '../../../systems/economy/vehicleStats'
import { fuelTenderLookOf } from '../../../systems/render/fuelTenderLook'
import type { VehicleState } from '../../../systems/vehicle/vehicleState'
import { fuelTankLevelOf } from '../../../systems/vehicle/vehicleFuel'
import type { RigLookBadge } from '../systems/render/rigLookBadges'
import { rigLookIndexOf } from '../systems/render/rigLookIndex'
import { rigLookBadgesOf, type OwnedLevels } from '../systems/rigLookBadgeSet'
import { SHIPPED_RIG_LOOKS } from '../systems/rigLooks'

/** What changes a badge: each line's band and pips, the tank's tail and pips, the tier. */
export function readRigLookBadgeKey(): string {
  const vehicle = readLocalVehicle()
  const owned = ownedLevelsOf(vehicle)
  const tracks = SHIPPED_RIG_LOOKS.tracks.map((frames) => {
    const { band, pips } = rigLookIndexOf(frames.rows, owned.purchasesOf(frames.rows.track))
    return `${band}:${pips}`
  })
  const tank = fuelTenderLookOf(owned.tankLevel)
  return [...tracks, `${tank.tail}:${tank.pips}`, visualTier(vehicle.levels)].join(' ')
}

let kept: { key: string; badges: RigLookBadge[] } | null = null

/** The badges for `key` (`readRigLookBadgeKey`), read again only when the key changes. */
export function readRigLookBadgesFor(key: string, art: ArtCatalogue): readonly RigLookBadge[] {
  if (kept?.key !== key) kept = { key, badges: readRigLookBadges(art) }
  return kept.badges
}

/** The badges on the local rig as `art` places them. */
export function readRigLookBadges(art: ArtCatalogue): RigLookBadge[] {
  const vehicle = readLocalVehicle()
  const owned = ownedLevelsOf(vehicle)
  return rigLookBadgesOf(SHIPPED_RIG_LOOKS, owned, art, visualTier(vehicle.levels))
}

function ownedLevelsOf(vehicle: VehicleState): OwnedLevels {
  const levels: Readonly<Record<string, number | undefined>> = vehicle.levels
  return { purchasesOf: (track) => levels[track] ?? 0, tankLevel: fuelTankLevelOf(vehicle) }
}
