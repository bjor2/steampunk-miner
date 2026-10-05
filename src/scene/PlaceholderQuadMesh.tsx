/**
 * One part of a placeholder asset (#52 "Placeholders"): a flat-coloured quad at its centre, each
 * draw-order step a hair nearer the camera than the last. Rendered through React because it
 * changes only when the visual tier does, never per frame.
 */
import type { PlaceholderQuad } from '../systems/art/placeholderLook'

/** Small enough that ten draw-order steps stay inside the gap to the next layer of the scene. */
const Z_PER_DRAW_ORDER = 0.01

export function PlaceholderQuadMesh({ quad, baseZ }: { quad: PlaceholderQuad; baseZ: number }) {
  const [x, y] = quad.centre
  const z = baseZ + quad.z * Z_PER_DRAW_ORDER
  return (
    <mesh position={[x, y, z]}>
      <planeGeometry args={[quad.size[0], quad.size[1]]} />
      <meshBasicMaterial color={quad.colour} />
    </mesh>
  )
}
