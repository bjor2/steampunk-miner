/**
 * One part of a placeholder asset (#52 "Placeholders"): a flat-coloured quad at its centre, each
 * draw-order step a hair nearer the camera than the last. Lit like the final art will be (#38 lit
 * 2.5D, #48 lit brass): a matte surface the ambient, the headlamp and the point lights shade, and
 * the lamps glow by themselves. Rendered through React because it changes only when the visual
 * tier does, never per frame.
 */
import { slotOfPartId } from '../systems/art/artIds'
import type { PlaceholderQuad } from '../systems/art/placeholderLook'

/** Placeholders, tuned by eye until the S7a maps bring their own. */
const PART_ROUGHNESS = 0.55
const NO_GLOW = '#000000'
const LAMP_SLOT = /^headlamp(-\d+)?$/

function isLamp(quad: PlaceholderQuad): boolean {
  return LAMP_SLOT.test(slotOfPartId(quad.partId))
}

/** Small enough that ten draw-order steps stay inside the gap to the next layer of the scene. */
const Z_PER_DRAW_ORDER = 0.01

export function PlaceholderQuadMesh({ quad, baseZ }: { quad: PlaceholderQuad; baseZ: number }) {
  const [x, y] = quad.centre
  const z = baseZ + quad.z * Z_PER_DRAW_ORDER
  const emissive = isLamp(quad) ? quad.colour : NO_GLOW
  return (
    <mesh position={[x, y, z]}>
      <planeGeometry args={[quad.size[0], quad.size[1]]} />
      <meshStandardMaterial color={quad.colour} roughness={PART_ROUGHNESS} emissive={emissive} />
    </mesh>
  )
}
