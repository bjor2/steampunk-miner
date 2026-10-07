/**
 * The dock add-ons standing on the pad (#170 amendment, art #197, wiring #222): the scanner mast,
 * the research annex and the drone hangar, each where the platform has built its facility row
 * (H1: a vision row shows nothing), bolted onto its host building at its `atM`. The parts' draw
 * order puts the annex behind the Works' shell and the mast and hangar over their hosts. While
 * mounted it follows the session for the unlock pan. The pad moves only with the planet, so this
 * renders through React on travel, never per frame.
 */
import { useEffect, useMemo } from 'react'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { useGameStore } from '../../../store/gameStore'
import { assetQuadsOf, atlasMapsOf } from '../../../systems/art/assetLook'
import { builtFacilityRowIdsOn } from '../../../systems/authority/builtFacilities'
import type { DockSite } from '../../../systems/world/dockSite'
import { followUnlockPans } from '../store/unlockPanStore'
import { dockAddOnAssetIdOf, standingDockAddOnsOf, type DockAddOn } from '../systems/dockAddOns'
import { dockAddOnOriginOf } from '../systems/render/dockAddOnPlacement'
import { BUILDING_Z, siteOfPlanet } from './padSite'

export function DockAddOns() {
  useEffect(followUnlockPans, [])
  // The planet's seed re-renders this on travel or a new seed, where the pad moves.
  useGameStore((state) => `${state.planetTier}:${state.planetSeed}`)
  const planetIndex = useGameStore((state) => state.planetTier)
  const site = siteOfPlanet()
  const standing = standingDockAddOnsOf(builtFacilityRowIdsOn(planetIndex))
  if (site === null) return null
  return (
    <>
      {standing.map((addOn) => (
        <DockAddOnPiece key={addOn.id} site={site} addOn={addOn} />
      ))}
    </>
  )
}

function DockAddOnPiece({ site, addOn }: { site: DockSite; addOn: DockAddOn }) {
  const look = useMemo(() => addOnLookOf(addOn), [addOn])
  const origin = dockAddOnOriginOf(site, addOn)
  return (
    <group position={[origin.x, origin.y, 0]}>
      {look.quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={look.maps} baseZ={BUILDING_Z} />
      ))}
    </group>
  )
}

/** The add-on's baked parts, or its placeholder quads until the atlas is in. */
function addOnLookOf(addOn: DockAddOn) {
  const assetId = dockAddOnAssetIdOf(addOn)
  return { quads: assetQuadsOf(SHIPPED_ART, assetId, 1), maps: atlasMapsOf(SHIPPED_ART, assetId) }
}
