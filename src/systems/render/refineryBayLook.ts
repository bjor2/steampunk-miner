/**
 * How the Refinery bay shows on the platform (#105 design, #106 art, #81 acceptance 3): from the
 * planet the platform gets it, the baked bay stands on its pad 8 m past the Upgrade bay with one of
 * its three looks over the frame: `ready` while any batch waits (an ingot stack), `refining` while
 * one runs (the lit furnace; smoke rises from the stack), else `idle`. Read from the authority's
 * slots and tick, so every player sees the same bay; the art decides nothing.
 */
import { REFINERY_BAY_LOOKS } from '../authority/platformState'
import { isBatchReady, type RefinerySlot } from '../authority/refinery/refineryBatch'
import type { ArtCatalogue } from '../art/artCatalogue'
import { refineryLookPartIdOf } from '../art/artIds'
import { assetQuadsOf, atlasMapsOf, type AssetQuad, type AtlasMaps } from '../art/assetLook'
import { bayCentreColumnOf } from '../world/dockBays'
import type { DockSite } from '../world/dockSite'

export type RefineryBayLook = (typeof REFINERY_BAY_LOOKS)[number]

export const REFINERY_BAY_ASSET_ID = 'platform-bay-refinery'

const LOOK_PART_IDS = new Set<string>(REFINERY_BAY_LOOKS.map(refineryLookPartIdOf))

export function refineryBayLookOf(slots: readonly RefinerySlot[], tick: number): RefineryBayLook {
  const batches = slots.filter((slot) => slot !== null)
  if (batches.some((batch) => isBatchReady(batch, tick))) return 'ready'
  return batches.length > 0 ? 'refining' : 'idle'
}

/** The bay's frame and the one look part it shows now, lowest draw order first. */
export function refineryBayQuadsOf(art: ArtCatalogue, look: RefineryBayLook): AssetQuad[] {
  const shown = refineryLookPartIdOf(look)
  return assetQuadsOf(art, REFINERY_BAY_ASSET_ID, 1).filter(
    (quad) => !LOOK_PART_IDS.has(quad.partId) || quad.partId === shown,
  )
}

export function refineryBayMaps(art: ArtCatalogue): AtlasMaps | null {
  return atlasMapsOf(art, REFINERY_BAY_ASSET_ID)
}

/** The bay's centre in metres from the platform's origin on the hub (one tile is one metre). */
export function refineryBayOffsetOf(site: DockSite): number {
  return bayCentreColumnOf(site, 'refinery') - site.dockPoint.tx
}
