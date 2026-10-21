/**
 * Parts of another asset a slice swaps onto the car (the rig-look seam, ticket 640; TD ruling and
 * GD lock on #579): each drawn at its swap's attach point, the way a mounted part is (#235), and in
 * place of the `vehicle` part slot the swap `replacesSlot`. A swap the art cannot draw (an asset the
 * catalogue lacks, a part that asset lacks, a point the vehicle lacks) draws nothing and hides
 * nothing, so the base part stays: a look never blocks a purchase (TD runtime fallback). A part that
 * stands in a `drill-` slot rides the swivelling head (#7), like the part it hides. Render-only:
 * no collider, hitbox, stat or event reads it.
 */
import type { ArtCatalogue } from '../art/artCatalogue'
import type { AssetQuad } from '../art/assetLook'
import { swapAssetIdOf, type PartSwapRequest } from '../registries/partMotionRequests'
import { mountedPartQuadsOf } from './mountedPartLook'

/** One look part as drawn, with the asset whose atlas it is cut from. */
export interface LookPartQuad {
  assetId: string
  quad: AssetQuad
}

/** What tells two drawn look parts apart: a part id is unique only within its asset. */
export function lookPartKeyOf(look: LookPartQuad): string {
  return `${look.assetId}/${look.quad.partId}`
}

/** Every drawn look part as `<assetId>/<partId>` (`steampunkDebug.vehicleParts().lookPartIds`). */
export function lookPartIdsOf(art: ArtCatalogue, looks: readonly PartSwapRequest[]): string[] {
  return [...lookBodyQuadsOf(art, looks), ...lookHeadQuadsOf(art, looks)].map(lookPartKeyOf)
}

/** No look swapped in. */
export const NO_LOOK_SWAPS: readonly PartSwapRequest[] = []

/** The `vehicle` part slots the drawable look swaps hide. */
export function hiddenSlotsOf(art: ArtCatalogue, looks: readonly PartSwapRequest[]): string[] {
  return drawableLooksOf(art, looks).flatMap((look) =>
    look.replacesSlot === undefined ? [] : [look.replacesSlot],
  )
}

/** The look parts drawn on the body, in the vehicle's frame. */
export function lookBodyQuadsOf(
  art: ArtCatalogue,
  looks: readonly PartSwapRequest[],
): LookPartQuad[] {
  return looks.filter((look) => !isOnDrillHead(look)).flatMap((look) => lookQuadsOf(art, look))
}

/** The look parts the drill head carries, in the vehicle's frame. */
export function lookHeadQuadsOf(
  art: ArtCatalogue,
  looks: readonly PartSwapRequest[],
): LookPartQuad[] {
  return looks.filter(isOnDrillHead).flatMap((look) => lookQuadsOf(art, look))
}

/** `look`'s parts at its point, or none when the art lacks any of them. */
function lookQuadsOf(art: ArtCatalogue, look: PartSwapRequest): LookPartQuad[] {
  const assetId = swapAssetIdOf(look)
  const quads = mountedPartQuadsOf(art, { assetId, attachId: look.attach }).filter((quad) =>
    look.partIds.includes(quad.partId),
  )
  if (quads.length !== look.partIds.length) return []
  return quads.map((quad) => ({ assetId, quad }))
}

function drawableLooksOf(art: ArtCatalogue, looks: readonly PartSwapRequest[]): PartSwapRequest[] {
  return looks.filter((look) => lookQuadsOf(art, look).length > 0)
}

/** It stands in a slot the head carries (`drill-bit`), so it turns with the head. */
function isOnDrillHead(look: PartSwapRequest): boolean {
  return look.replacesSlot?.startsWith('drill-') ?? false
}
