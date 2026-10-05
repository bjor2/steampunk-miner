/**
 * The platform on its pad (#8, #13): the outpost, and the core drive once the authority's
 * `platform.visualState` says so, with the core bay's fill gauge on its body. Drawn behind the
 * vehicle; it changes only when the replica does, so it renders through React like the vehicle's
 * parts, never per frame.
 */
import { readPlanetWorld, useGameStore } from '../store/gameStore'
import {
  coreBayFillOf,
  platformLookOf,
  platformOriginOf,
  type PartShape,
} from '../systems/render/platformPlaceholder'
import { dockSiteOf } from '../systems/world/dockSite'

/** Behind the vehicle and the enemies, in front of the tiles. */
const PLATFORM_Z = 0.02
const GAUGE_Z = 0.03
const FILL_Z = 0.035
const DISC_SEGMENTS = 28
const GAUGE_FRAME = '#1b1613'
const GAUGE_FILL = '#ff8a4a'

export function PlatformPlaceholder() {
  // The planet's seed re-renders this on travel or a new seed, where the pad moves.
  useGameStore((state) => `${state.planetTier}:${state.planetSeed}`)
  const platform = useGameStore((state) => state.platform)
  const origin = originOfPlanet()
  if (origin === null) return null
  const look = platformLookOf(platform.visualState)
  const fill = coreBayFillOf(platform.coreBay, platform.coreNeeded)
  return (
    <group position={[origin.x, origin.y, 0]}>
      {look.shapes.map((shape, at) => (
        <PlatformShapeMesh key={`${platform.visualState}.${at}`} shape={shape} />
      ))}
      <BayGauge offset={look.bayGauge.offset} size={look.bayGauge.size} fill={fill} />
    </group>
  )
}

/** The pad moves only with the planet; read on a render, never per frame. */
function originOfPlanet(): { x: number; y: number } | null {
  const { params } = readPlanetWorld()
  return params === null ? null : platformOriginOf(dockSiteOf(params))
}

function PlatformShapeMesh({ shape }: { shape: PartShape }) {
  const [width, height] = shape.size
  const [x, y] = shape.offset
  return (
    <mesh position={[x, y, PLATFORM_Z]}>
      {shape.shape === 'disc' ? (
        <circleGeometry args={[width / 2, DISC_SEGMENTS]} />
      ) : (
        <planeGeometry args={[width, height]} />
      )}
      <meshBasicMaterial color={shape.colour} />
    </mesh>
  )
}

function BayGauge({
  offset,
  size,
  fill,
}: {
  offset: readonly [number, number]
  size: readonly [number, number]
  fill: number
}) {
  const [width, height] = size
  const fillHeight = height * fill
  const fillY = offset[1] - height / 2 + fillHeight / 2
  return (
    <>
      <mesh position={[offset[0], offset[1], GAUGE_Z]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={GAUGE_FRAME} />
      </mesh>
      {fill > 0 && (
        <mesh position={[offset[0], fillY, FILL_Z]}>
          <planeGeometry args={[width * 0.7, fillHeight]} />
          <meshBasicMaterial color={GAUGE_FILL} />
        </mesh>
      )}
    </>
  )
}
