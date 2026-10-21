/**
 * One look part of another asset on the car (ticket 640): cut from that asset's own atlas, a flat
 * placeholder quad until it is final or while the atlas loads, like every part.
 */
import { useMemo } from 'react'
import { atlasMapsOf } from '../systems/art/assetLook'
import type { LookPartQuad } from '../systems/render/lookPartQuads'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'

export function LookPartMesh({ look, baseZ }: { look: LookPartQuad; baseZ: number }) {
  const maps = useMemo(() => atlasMapsOf(SHIPPED_ART, look.assetId), [look.assetId])
  return <PartQuadMesh quad={look.quad} maps={maps} baseZ={baseZ} />
}
