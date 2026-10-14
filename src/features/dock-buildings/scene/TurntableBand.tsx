/**
 * The Works' turntable (ticket 395): its baked band drawn in vertical strips whose texture
 * coordinates are remapped on the drum's cylinder each frame (`turntableSpin.ts`), so the rim lamps
 * travel round while the band stays put. Lit like every atlas part (AtlasQuadMesh); the emissive
 * map is left off because building parts draw it at zero intensity. Before the asset is final, and
 * while the atlas transcodes, the still placeholder quad stands in.
 */
import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { PlaneGeometry, type BufferAttribute } from 'three'
import { useAtlasAlbedo, useAtlasNormal } from '../../../scene/atlasTextures'
import { useDisposeOnRelease } from '../../../scene/disposeOnRelease'
import { PlaceholderQuadMesh } from '../../../scene/PlaceholderQuadMesh'
import type { AssetQuad, AtlasMaps, AtlasUv } from '../../../systems/art/assetLook'
import { rimPeriodRadiansOf, writeBandUvs } from '../systems/render/turntableSpin'
import { WORKS_IDLE } from '../systems/render/worksIdle'
import { worksIdleNow } from './worksIdleNow'

/** As AtlasQuadMesh draws every part: draw-order step, hard mask cut and matte surface. */
const Z_PER_DRAW_ORDER = 0.01
const MASK_CUTOFF = 0.5
const PART_ROUGHNESS = 0.55

interface TurntableBandProps {
  quad: AssetQuad
  maps: AtlasMaps | null
  baseZ: number
}

export function TurntableBand({ quad, maps, baseZ }: TurntableBandProps) {
  const still = <PlaceholderQuadMesh quad={quad} baseZ={baseZ} />
  if (maps === null || !isCutFromAtlas(quad)) return still
  return (
    <Suspense fallback={still}>
      <TurningBand quad={quad} maps={maps} baseZ={baseZ} />
    </Suspense>
  )
}

interface TurningBandProps {
  quad: AssetQuad & { uv: AtlasUv }
  maps: AtlasMaps
  baseZ: number
}

function TurningBand({ quad, maps, baseZ }: TurningBandProps) {
  const albedo = useAtlasAlbedo(maps)
  const normal = useAtlasNormal(maps)
  const columns = WORKS_IDLE.turntable.bandColumns
  const geometry = useMemo(() => createBandGeometry(quad, columns), [quad, columns])
  useDisposeOnRelease(geometry)
  const period = useMemo(() => rimPeriodRadiansOf(), [])
  useFrame(() => turnBand(geometry, columns, quad.uv, period))
  return (
    <mesh
      position={[quad.centre[0], quad.centre[1], baseZ + quad.z * Z_PER_DRAW_ORDER]}
      geometry={geometry}
    >
      <meshStandardMaterial
        map={albedo}
        normalMap={normal}
        roughness={PART_ROUGHNESS}
        alphaTest={MASK_CUTOFF}
      />
    </mesh>
  )
}

function createBandGeometry(quad: AssetQuad, columns: number): PlaneGeometry {
  return new PlaneGeometry(quad.size[0], quad.size[1], columns, 1)
}

function turnBand(geometry: PlaneGeometry, columns: number, rect: AtlasUv, period: number): void {
  const uv = geometry.attributes.uv as BufferAttribute
  writeBandUvs(uv.array as Float32Array, columns, rect, worksIdleNow.spin.angle, period)
  uv.needsUpdate = true
}

function isCutFromAtlas(quad: AssetQuad): quad is AssetQuad & { uv: AtlasUv } {
  return quad.uv !== null
}
