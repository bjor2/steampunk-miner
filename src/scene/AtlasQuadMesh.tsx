/**
 * One part of a final asset (#52): a quad textured with its rectangle of the albedo atlas, its
 * mask cutting the outline. Lit like the placeholders (#38 lit 2.5D, #48 lit brass): a matte
 * surface shaded by the ambient, headlamp and point lights, with the normal and emissive maps
 * from the S7a export. It sits in a group at its pivot so part motion (#48) turns and lifts it
 * about the point the art names. Each draw-order step sits a hair nearer the camera than the last.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { PlaneGeometry, type Group, type MeshStandardMaterial } from 'three'
import { DRILL_SPARK_LIGHT } from '../constants/scene'
import { useGameStore } from '../store/gameStore'
import { slotOfPartId } from '../systems/art/artIds'
import type { AssetQuad, AtlasMaps, AtlasUv } from '../systems/art/assetLook'
import { createPartPose, writePartPose, type PartPose } from '../systems/render/partMotion'
import { useAtlasAlbedo, useAtlasEmissive, useAtlasNormal } from './atlasTextures'
import { partMotion } from './partMotionPresence'

/** Small enough that ten draw-order steps stay inside the gap to the next layer of the scene. */
const Z_PER_DRAW_ORDER = 0.01
/** The albedo alpha is a hard part mask (#52); cut, don't blend, so draw order stays exact. */
const MASK_CUTOFF = 0.5
/** Placeholders, tuned by eye until the S7a maps bring their own. */
const PART_ROUGHNESS = 0.55
/** The drill tip glows the colour of its sparks; a lamp glows its own colour. */
const DRILL_TIP_GLOW = DRILL_SPARK_LIGHT.colour

interface AtlasQuadMeshProps {
  quad: AssetQuad & { uv: AtlasUv }
  maps: AtlasMaps
  baseZ: number
}

export function AtlasQuadMesh({ quad, maps, baseZ }: AtlasQuadMeshProps) {
  if (maps.emissive !== null) {
    return (
      <AtlasQuadMeshWithEmissive
        quad={quad}
        maps={{ ...maps, emissive: maps.emissive }}
        baseZ={baseZ}
      />
    )
  }
  return <AtlasQuadMeshLit quad={quad} maps={maps} baseZ={baseZ} emissiveMap={null} />
}

function AtlasQuadMeshWithEmissive({
  quad,
  maps,
  baseZ,
}: {
  quad: AssetQuad & { uv: AtlasUv }
  maps: AtlasMaps & { emissive: string }
  baseZ: number
}) {
  const emissiveMap = useAtlasEmissive(maps)
  return <AtlasQuadMeshLit quad={quad} maps={maps} baseZ={baseZ} emissiveMap={emissiveMap} />
}

function AtlasQuadMeshLit({
  quad,
  maps,
  baseZ,
  emissiveMap,
}: {
  quad: AssetQuad & { uv: AtlasUv }
  maps: AtlasMaps
  baseZ: number
  emissiveMap: ReturnType<typeof useAtlasAlbedo> | null
}) {
  const albedo = useAtlasAlbedo(maps)
  const normal = useAtlasNormal(maps)
  const geometry = useMemo(() => createAtlasQuad(quad), [quad])
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
      <mesh position={[quad.centre[0] - pivotX, quad.centre[1] - pivotY, 0]} geometry={geometry}>
        <meshStandardMaterial
          ref={material}
          map={albedo}
          normalMap={normal}
          emissiveMap={emissiveMap ?? undefined}
          emissive={glowColour}
          emissiveIntensity={0}
          roughness={PART_ROUGHNESS}
          alphaTest={MASK_CUTOFF}
        />
      </mesh>
    </group>
  )
}

/** The shake switch is the motion switch too (#33, #48 acceptance 6). */
function isMotionReduced(): boolean {
  return !useGameStore.getState().prefs.shake
}

function placePart(group: Group | null, quad: AssetQuad, z: number, pose: PartPose): void {
  if (group === null) return
  group.position.set(quad.pivot[0] + pose.x, quad.pivot[1] + pose.y, z)
  group.rotation.z = pose.angle
  group.scale.y = pose.scaleY
}

function glowPart(material: MeshStandardMaterial | null, glow: number): void {
  if (material !== null) material.emissiveIntensity = glow
}

/** PlaneGeometry's corners run top-left, top-right, bottom-left, bottom-right. */
function createAtlasQuad(quad: AssetQuad & { uv: AtlasUv }): PlaneGeometry {
  const geometry = new PlaneGeometry(quad.size[0], quad.size[1])
  const [left, bottom, right, top] = quad.uv
  geometry.attributes.uv.array.set([left, top, right, top, left, bottom, right, bottom])
  return geometry
}
