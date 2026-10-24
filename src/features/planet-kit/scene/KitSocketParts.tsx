/**
 * The kit items' placeholder parts on the car (G&V on ticket 823): one flat quad per socket of
 * `kitSockets.json`, at the base vehicle's attach point (feature-slices.md 3.11), so no offset
 * lives in code. Drawn in the body frame, so it turns and mirrors with the car; it never touches
 * the colliders or the drill tip. Shown only while `features['planet-kit'].showKitSockets()`
 * holds it on, until #850 lets a player own a kit tool; the Blender art replaces each quad.
 */
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { useKitSocketStore } from '../store/kitSocketStore'
import { KIT_SOCKETS, type KitSocket } from '../systems/kitSockets'

export const KIT_SOCKET_PIECE_ID = 'planet-kit.kit-sockets'

/** The body's parts' layer, as `MountedParts` hangs gear, plus a hair per attach draw order. */
const MOUNTED_Z = 0.1
const Z_PER_DRAW_ORDER = 0.01

/** Placeholders, as `PlaceholderQuadMesh`'s matte parts. */
const PART_ROUGHNESS = 0.55

export function KitSocketParts() {
  const areShown = useKitSocketStore((state) => state.areShown)
  if (!areShown) return null
  return (
    <>
      {KIT_SOCKETS.map((socket) => (
        <KitSocketPart key={socket.itemId} socket={socket} />
      ))}
    </>
  )
}

function KitSocketPart({ socket }: { socket: KitSocket }) {
  const point = vehicleAttachPointOf(SHIPPED_ART, socket.attach)
  if (point === null) return null
  const [width, height] = socket.placeholder.sizeM
  const z = MOUNTED_Z + point.z * Z_PER_DRAW_ORDER
  return (
    <mesh name={`planet-kit.${socket.itemId}`} position={[point.atM[0], point.atM[1], z]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial color={socket.placeholder.colour} roughness={PART_ROUGHNESS} />
    </mesh>
  )
}
