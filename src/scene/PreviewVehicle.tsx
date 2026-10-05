/**
 * The vehicle on the Upgrade bay's plinth (#44): the run vehicle's own parts at the tier it owns,
 * facing right with the drill head out in front. The focused track's parts pulse with a teal
 * outline; a part just bought drops into place with a puff of steam over 0.4 s; a buy that would
 * cross a visual tier shows the next tier as a ghost over the vehicle. Motion is written on refs
 * each frame and stays still with reduce motion (the shake switch, #33, #48).
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { PART_INSTALL_MS } from '../constants/scene'
import { useGameStore } from '../store/gameStore'
import type { AssetQuad } from '../systems/art/assetLook'
import type { UpgradeId } from '../systems/economy/economyDefinition'
import { drillHeadReachOf, isPartOfTrack } from '../systems/render/vehiclePreviewLook'
import {
  drillHeadQuadsOf,
  vehicleAtlasMaps,
  vehicleBodyQuadsOf,
} from '../systems/render/vehicleLook'
import { PartQuadMesh } from './PartQuadMesh'

const BODY_Z = 0.1
const HEAD_Z = 0.2
const GHOST_Z = 0.5
const Z_PER_DRAW_ORDER = 0.01
/** Placeholders tuned by eye in `npm run dev`. */
const OUTLINE = { colour: '#3fa7a0', marginM: 0.06, pulsesPerSecond: 1.5 }
const GHOST_OPACITY = 0.35
const DROP_M = 0.35
const PUFF = { colour: '#f2efe6', startRadiusM: 0.1, endRadiusM: 0.45, opacity: 0.7 }

const maps = vehicleAtlasMaps()

interface PartFocus {
  highlight: UpgradeId | null
  installing: UpgradeId | null
}

interface PreviewVehicleProps extends PartFocus {
  visualTier: number
}

export function PreviewVehicle({ visualTier, highlight, installing }: PreviewVehicleProps) {
  const body = useMemo(() => vehicleBodyQuadsOf(visualTier), [visualTier])
  const head = useMemo(() => drillHeadQuadsOf(visualTier), [visualTier])
  const partOf = (quad: AssetQuad) => (
    <PreviewPart key={quad.partId} quad={quad} highlight={highlight} installing={installing} />
  )
  return (
    <>
      <group position={[0, 0, BODY_Z]}>{body.map(partOf)}</group>
      <group position={[drillHeadReachOf(visualTier), 0, HEAD_Z]}>{head.map(partOf)}</group>
    </>
  )
}

/** The next tier's whole silhouette, see-through over the vehicle (#44 "ghost overlay"). */
export function GhostVehicle({ visualTier }: { visualTier: number }) {
  const body = useMemo(() => vehicleBodyQuadsOf(visualTier), [visualTier])
  const head = useMemo(() => drillHeadQuadsOf(visualTier), [visualTier])
  return (
    <group position={[0, 0, GHOST_Z]}>
      {body.map((quad) => (
        <GhostQuad key={quad.partId} quad={quad} />
      ))}
      <group position={[drillHeadReachOf(visualTier), 0, 0]}>
        {head.map((quad) => (
          <GhostQuad key={quad.partId} quad={quad} />
        ))}
      </group>
    </group>
  )
}

function PreviewPart({ quad, highlight, installing }: { quad: AssetQuad } & PartFocus) {
  return (
    <InstallDrop isInstalling={isPartOfTrack(quad, installing)} quad={quad}>
      {isPartOfTrack(quad, highlight) && <PartOutline quad={quad} />}
      <PartQuadMesh quad={quad} maps={maps} baseZ={0} />
    </InstallDrop>
  )
}

function GhostQuad({ quad }: { quad: AssetQuad }) {
  return (
    <mesh position={[quad.centre[0], quad.centre[1], quad.z * Z_PER_DRAW_ORDER]}>
      <planeGeometry args={[quad.size[0], quad.size[1]]} />
      <meshBasicMaterial
        color={quad.colour}
        transparent
        opacity={GHOST_OPACITY}
        depthWrite={false}
      />
    </mesh>
  )
}

/** A teal frame just behind the part, pulsing unless reduce motion holds it steady. */
function PartOutline({ quad }: { quad: AssetQuad }) {
  const material = useRef<MeshBasicMaterial>(null)
  useFrame(({ clock }) => pulseOutline(material.current, clock.elapsedTime))
  const z = quad.z * Z_PER_DRAW_ORDER - Z_PER_DRAW_ORDER / 2
  return (
    <mesh position={[quad.centre[0], quad.centre[1], z]}>
      <planeGeometry
        args={[quad.size[0] + 2 * OUTLINE.marginM, quad.size[1] + 2 * OUTLINE.marginM]}
      />
      <meshBasicMaterial ref={material} color={OUTLINE.colour} transparent depthWrite={false} />
    </mesh>
  )
}

function pulseOutline(material: MeshBasicMaterial | null, seconds: number): void {
  if (material === null) return
  const wave = Math.sin(seconds * OUTLINE.pulsesPerSecond * 2 * Math.PI)
  material.opacity = isMotionReduced() ? 0.8 : 0.55 + 0.35 * wave
}

/**
 * Drops an installing part from above onto its place over 0.4 s, with a puff of steam that
 * swells and fades (#44); at rest otherwise.
 */
function InstallDrop({
  isInstalling,
  quad,
  children,
}: {
  isInstalling: boolean
  quad: AssetQuad
  children: ReactNode
}) {
  const group = useRef<Group>(null)
  const puff = useRef<Mesh>(null)
  const startedAt = useRef<number | null>(null)
  useFrame(({ clock }) => {
    startedAt.current = isInstalling ? (startedAt.current ?? clock.elapsedTime) : null
    const progress = installProgressOf(startedAt.current, clock.elapsedTime)
    group.current?.position.setY(DROP_M * (1 - progress))
    swellPuff(puff.current, progress)
  })
  return (
    <>
      <group ref={group}>{children}</group>
      <mesh ref={puff} position={[quad.centre[0], quad.centre[1], 0.3]} visible={false}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial color={PUFF.colour} transparent depthWrite={false} />
      </mesh>
    </>
  )
}

/** 0 when the drop starts, 1 once the part is home (and always when nothing installs). */
function installProgressOf(startedAt: number | null, now: number): number {
  if (startedAt === null) return 1
  return Math.min(((now - startedAt) * 1000) / PART_INSTALL_MS, 1)
}

function swellPuff(puff: Mesh | null, progress: number): void {
  if (puff === null) return
  puff.visible = progress < 1
  puff.scale.setScalar(PUFF.startRadiusM + (PUFF.endRadiusM - PUFF.startRadiusM) * progress)
  ;(puff.material as MeshBasicMaterial).opacity = PUFF.opacity * (1 - progress)
}

/** The shake switch is the motion switch too (#33, #48 acceptance 6). */
function isMotionReduced(): boolean {
  return !useGameStore.getState().prefs.shake
}
