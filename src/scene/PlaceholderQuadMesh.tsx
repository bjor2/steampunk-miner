/**
 * One part of a placeholder asset (#52 "Placeholders"): a flat-coloured quad, each draw-order
 * step a hair nearer the camera than the last. Lit like the final art will be (#38 lit 2.5D, #48
 * lit brass): a matte surface the ambient, the headlamp and the point lights shade. It sits in a
 * group at its pivot, so its motion (#48: wheels roll, the drill turns, pistons pump, the boiler
 * bobs, the lamp and the drill tip glow) turns and lifts it about the point the art names. The
 * quad renders through React because it changes only with the visual tier; its pose is written
 * on refs each frame.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group, MeshStandardMaterial } from 'three'
import { DRILL_SPARK_LIGHT } from '../constants/scene'
import { useGameStore } from '../store/gameStore'
import { slotOfPartId } from '../systems/art/artIds'
import type { PlaceholderQuad } from '../systems/art/placeholderLook'
import { createPartPose, writePartPose, type PartPose } from '../systems/render/partMotion'
import { partMotion } from './partMotionPresence'

/** Small enough that ten draw-order steps stay inside the gap to the next layer of the scene. */
const Z_PER_DRAW_ORDER = 0.01

/** Placeholders, tuned by eye until the S7a maps bring their own. */
const PART_ROUGHNESS = 0.55
/** The drill tip glows the colour of its sparks; a lamp glows its own colour. */
const DRILL_TIP_GLOW = DRILL_SPARK_LIGHT.colour

export function PlaceholderQuadMesh({ quad, baseZ }: { quad: PlaceholderQuad; baseZ: number }) {
  const group = useRef<Group>(null)
  const material = useRef<MeshStandardMaterial>(null)
  const pose = useMemo(createPartPose, [])
  const slot = slotOfPartId(quad.partId)
  const [pivotX, pivotY] = quad.pivot
  const z = baseZ + quad.z * Z_PER_DRAW_ORDER
  const glowColour = slot.startsWith('drill-bit') ? DRILL_TIP_GLOW : quad.colour
  useFrame(() => {
    writePartPose(partMotion, slot, quad.size[1] / 2, isMotionReduced(), pose)
    placePart(group.current, quad, z, pose)
    glowPart(material.current, pose.glow)
  })
  return (
    <group ref={group} position={[pivotX, pivotY, z]}>
      <mesh position={[quad.centre[0] - pivotX, quad.centre[1] - pivotY, 0]}>
        <planeGeometry args={[quad.size[0], quad.size[1]]} />
        <meshStandardMaterial
          ref={material}
          color={quad.colour}
          roughness={PART_ROUGHNESS}
          emissive={glowColour}
          emissiveIntensity={0}
        />
      </mesh>
    </group>
  )
}

/** The shake switch is the motion switch too (#33, #48 acceptance 6). */
function isMotionReduced(): boolean {
  return !useGameStore.getState().prefs.shake
}

function placePart(group: Group | null, quad: PlaceholderQuad, z: number, pose: PartPose): void {
  if (group === null) return
  group.position.set(quad.pivot[0] + pose.x, quad.pivot[1] + pose.y, z)
  group.rotation.z = pose.angle
  group.scale.y = pose.scaleY
}

function glowPart(material: MeshStandardMaterial | null, glow: number): void {
  if (material !== null) material.emissiveIntensity = glow
}
