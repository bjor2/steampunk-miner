/**
 * The kit tools on the car (G&V on ticket 823; the Blender art of ticket 825): each socket's asset
 * hung at the base vehicle's attach point (feature-slices.md 3.11), so no offset lives in code,
 * every part in a group at its pivot turned to its pose, the flasks up to the held count and the
 * shard only while the tongs act. Drawn in the body frame, so it turns and mirrors with the car; it
 * never touches the colliders or the drill tip. Since ticket 883 the car hangs the tools the local
 * player owns, each deployed while it acts (its tail included), and the flask rack while a flask
 * is carried or open (`kitSocketShows.ts`); `features['planet-kit'].showKitSockets()` overrides
 * that with every socket for the eye check. While on the car each asset shows in
 * `steampunkDebug.vehicleParts().mounted`.
 */
import { useEffect, useMemo } from 'react'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { showMountedParts } from '../../../scene/mountedPartsPresence'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { atlasMapsOf, type AtlasMaps } from '../../../systems/art/assetLook'
import { useScreenModel } from '../../../ui/useScreenModel'
import { readKitSocketsShown } from '../store/kitSocketReads'
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
  return areShown ? <DebugShownSockets /> : <OwnedSockets />
}

/** Every socket as the debug call asked, for the eye check and the screen suite. */
function DebugShownSockets() {
  const show = useKitSocketStore((state) => state.show)
  return (
    <>
      {KIT_SOCKETS.map((socket) => (
        <KitSocketPart key={socket.itemId} socket={socket} show={show} />
      ))}
    </>
  )
}

/** The local player's kit on the car, deployed while it acts. */
function OwnedSockets() {
  const shown = useScreenModel(readKitSocketsShown)
  return (
    <>
      {shown.map(({ socket, show }) => (
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
