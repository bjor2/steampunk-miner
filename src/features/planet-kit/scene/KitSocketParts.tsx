/**
 * The kit tools on the car (G&V on ticket 823; the Blender art of ticket 825): each socket's asset
 * hung at the base vehicle's attach point (feature-slices.md 3.11), so no offset lives in code,
 * every part in a group at its pivot turned to its pose, the flasks up to the held count and the
 * shard only while the tongs act. Drawn in the body frame, so it turns and mirrors with the car; it
 * never touches the colliders or the drill tip. Shown while `features['planet-kit'].showKitSockets()`
 * holds it on, until #850 lets a player own a kit tool; while on the car each asset shows in
 * `steampunkDebug.vehicleParts().mounted`.
 */
import { useEffect, useMemo } from 'react'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { showMountedParts } from '../../../scene/mountedPartsPresence'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { atlasMapsOf, type AtlasMaps } from '../../../systems/art/assetLook'
import { useKitSocketStore } from '../store/kitSocketStore'
import {
  kitSocketQuadsOf,
  type KitSocketQuad,
  type KitSocketShow,
} from '../systems/render/kitSocketLook'
import { KIT_SOCKETS, type KitSocket } from '../systems/kitSockets'

export const KIT_SOCKET_PIECE_ID = 'planet-kit.kit-sockets'

/** The body's parts' layer, as `MountedParts` hangs gear: authored draw orders interleave. */
const MOUNTED_Z = 0.1

export function KitSocketParts() {
  const areShown = useKitSocketStore((state) => state.areShown)
  const show = useKitSocketStore((state) => state.show)
  if (!areShown) return null
  return (
    <>
      {KIT_SOCKETS.map((socket) => (
        <KitSocketPart key={socket.itemId} socket={socket} show={show} />
      ))}
    </>
  )
}

function KitSocketPart({ socket, show }: { socket: KitSocket; show: KitSocketShow }) {
  const quads = useMemo(() => kitSocketQuadsOf(SHIPPED_ART, socket, show), [socket, show])
  const maps = useMemo(() => atlasMapsOf(SHIPPED_ART, socket.assetId), [socket.assetId])
  useEffect(
    () => showMountedParts({ assetId: socket.assetId, attachId: socket.attach }, quads),
    [socket, quads],
  )
  return (
    <>
      {quads.map((quad) => (
        <PosedSocketQuad key={quad.partId} quad={quad} maps={maps} />
      ))}
    </>
  )
}

/** A part in a group at its pivot, turned as its pose says, holding the quad about that pivot. */
function PosedSocketQuad({ quad, maps }: { quad: KitSocketQuad; maps: AtlasMaps | null }) {
  const [pivotX, pivotY] = quad.pivot
  const aboutPivot = useMemo(
    () => ({ ...quad, centre: offsetOf(quad), pivot: [0, 0] as const }),
    [quad],
  )
  return (
    <group position={[pivotX, pivotY, 0]} rotation={[0, 0, quad.turn]}>
      <PartQuadMesh quad={aboutPivot} maps={maps} baseZ={MOUNTED_Z} />
    </group>
  )
}

function offsetOf(quad: KitSocketQuad): readonly [number, number] {
  return [quad.centre[0] - quad.pivot[0], quad.centre[1] - quad.pivot[1]]
}
