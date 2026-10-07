/**
 * A planted charge's look (#153 "every size unlock is a visible new model", #145a models; took
 * over from the kernel's `chargeLook.ts` in #215): the planted size's body on its wall tile, and
 * its lamp, which blinks by being shown and hidden, faster in the fuse's last second. A remote
 * charge (K8 #218) has no fuse, so its lamp never hurries.
 */
import { FUSE_BLINK_LAST_SECOND_SECONDS, FUSE_BLINK_SECONDS } from '../../../../constants/scene'
import { TICKS_PER_SECOND } from '../../../../constants/physics'
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import {
  assetQuadsOf,
  atlasMapsOf,
  type AssetQuad,
  type AtlasMaps,
} from '../../../../systems/art/assetLook'
import type { PlantedCharge } from '../../../../systems/vehicle/vehicleCharges'
import { lampPartIdOf, PLANTED_DYNAMITE_ASSET_ID, plantedPartIdOf } from './dynamiteArt'

/** The asset's one look: every part is authored at tier 1. */
const ONLY_LOOK = 1
const LAST_SECOND_TICKS = TICKS_PER_SECOND

/** The body of a planted charge of `size`, without its lamp. */
export function plantedBodyQuadsOf(art: ArtCatalogue, size: number): AssetQuad[] {
  return plantedQuadsNamed(art, plantedPartIdOf(size))
}

/** The lamp of a planted charge of `size`, alone, so it can blink. */
export function plantedLampQuadsOf(art: ArtCatalogue, size: number): AssetQuad[] {
  return plantedQuadsNamed(art, lampPartIdOf(size))
}

export function plantedDynamiteMaps(art: ArtCatalogue): AtlasMaps | null {
  return atlasMapsOf(art, PLANTED_DYNAMITE_ASSET_ID)
}

/** Ticks left on a charge's fuse; a remote charge has none. */
export function fuseTicksLeftOf(charge: PlantedCharge, tick: number): number {
  return charge.detonateTick === null ? Number.POSITIVE_INFINITY : charge.detonateTick - tick
}

/** Whether the lamp is lit `seconds` into its blinking with `ticksLeft` on the fuse. */
export function isFuseLampLit(seconds: number, ticksLeft: number): boolean {
  const period =
    ticksLeft <= LAST_SECOND_TICKS ? FUSE_BLINK_LAST_SECOND_SECONDS : FUSE_BLINK_SECONDS
  return Math.floor(seconds / period) % 2 === 0
}

function plantedQuadsNamed(art: ArtCatalogue, partId: string): AssetQuad[] {
  return assetQuadsOf(art, PLANTED_DYNAMITE_ASSET_ID, ONLY_LOOK).filter(
    (quad) => quad.partId === partId,
  )
}
