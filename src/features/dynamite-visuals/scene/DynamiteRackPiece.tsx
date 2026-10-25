/**
 * The dynamite rack on the car (#215, the rack swap of the #145 TD lock; D7 ticket 866): a vehicle
 * piece (#235) that hangs `vehicle-dynamite-rack` at the point its attach use registers
 * (`hull.rear`), with a bay for every charge type open on the planet, a lit pip per charge of the
 * type carried, the reel and plunger once the detonator is open and the nozzle once Blast Casing
 * is owned, the bays grown for the Blast Radius band. It changes only when the rack is bolted on,
 * the planet changes, a type opens, the stock changes or a node is bought, so it renders through
 * React.
 * Behind the body's parts, as the kernel rack it replaces hung; listed in
 * `steampunkDebug.vehicleParts().mounted` while on the car.
 */
import { useEffect, useMemo } from 'react'
import type { AssetQuad } from '../../../systems/art/assetLook'
import type { PartMount } from '../../../systems/render/mountedPartLook'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { showMountedParts } from '../../../scene/mountedPartsPresence'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { useGameStore } from '../../../store/gameStore'
import { readRackPartIds, readRackSight } from '../store/rackSightReads'
import { rackMaps, rackMountOf, rackQuadsOf } from '../systems/render/rackLook'

export const DYNAMITE_RACK_PIECE_ID = 'dynamite-visuals.rack'

/** Behind the body's parts (0.1): the rack hangs off the rear of the chassis. */
const RACK_Z = 0.06
const maps = rackMaps(SHIPPED_ART)

export function DynamiteRackPiece() {
  // One string, so the piece renders again only when the shown parts change.
  const shownKey = useGameStore(() => readRackPartIds().join(' '))
  const radiusLevel = useGameStore(() => readRackSight().radiusLevel)
  const mount = useMemo(rackMountOf, [])
  const quads = useMemo(
    () => (mount === null ? [] : rackQuadsOf(SHIPPED_ART, mount, shownKey.split(' '), radiusLevel)),
    [mount, shownKey, radiusLevel],
  )
  useEffect(() => showRackParts(mount, quads), [mount, quads])
  return (
    <>
      {quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={RACK_Z} />
      ))}
    </>
  )
}

/** Lists the rack's parts on the car while it shows any; returns the call that takes them back. */
function showRackParts(
  mount: PartMount | null,
  quads: readonly AssetQuad[],
): (() => void) | undefined {
  if (mount === null || quads.length === 0) return undefined
  return showMountedParts(mount, quads)
}
