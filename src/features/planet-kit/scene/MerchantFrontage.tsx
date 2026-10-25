/**
 * The merchant's frontage on the Assay & Exchange (ticket 825; the GD lock of 24 Oct: one merchant
 * system, variants as data): where the session's planet has an authored merchant, its awning,
 * shingle and banner bolt onto the Sell building at the table's `atM` from the building's origin,
 * the zone's centre on the pad top, as the dock add-ons are placed (#197). The pad moves only with
 * the planet, so this renders through React on travel, never per frame. Presentation only.
 */
import { useMemo } from 'react'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { readPlanetWorld, useGameStore } from '../../../store/gameStore'
import { atlasMapsOf } from '../../../systems/art/assetLook'
import { bayCentreColumnOf } from '../../../systems/world/dockBays'
import { dockSiteOf, type DockSite } from '../../../systems/world/dockSite'
import { readMerchantFrontageDrawn, type MerchantFrontageDrawn } from '../store/merchantArtReads'
import { MERCHANT_ART } from '../systems/merchantArt'

export const MERCHANT_FRONTAGE_PIECE_ID = 'planet-kit.merchant-frontage'

/** A hair over the shop buildings' layer (0.005), so the frontage draws over the station's parts. */
const FRONTAGE_Z = 0.006

export function MerchantFrontage() {
  // The planet's seed re-renders this on travel or a new seed, where the pad and the merchant change.
  useGameStore((state) => `${state.planetTier}:${state.planetSeed}`)
  const site = siteOfPlanet()
  const drawn = readMerchantFrontageDrawn()
  if (site === null || drawn === null) return null
  return <FrontagePiece site={site} drawn={drawn} />
}

function FrontagePiece({ site, drawn }: { site: DockSite; drawn: MerchantFrontageDrawn }) {
  const maps = useMemo(() => atlasMapsOf(SHIPPED_ART, drawn.frontage.assetId), [drawn])
  const [x, y] = frontageOriginOf(site)
  return (
    <group position={[x, y, 0]}>
      {drawn.quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={FRONTAGE_Z} />
      ))}
    </group>
  )
}

function siteOfPlanet(): DockSite | null {
  const { params } = readPlanetWorld()
  return params === null ? null : dockSiteOf(params)
}

/** The host's origin, the Sell zone's centre column on the pad top, plus the table's `atM`. */
function frontageOriginOf(site: DockSite): readonly [number, number] {
  const [dx, dy] = MERCHANT_ART.atM
  return [bayCentreColumnOf(site, MERCHANT_ART.host) + dx, site.padRow + 1 + dy]
}
