/**
 * The #166 gear on the car (ticket 250): a vehicle piece (#235) that hangs every registered item
 * the loadout mounts at its attach point, posed and mirrored where the art says (an extractor
 * unfolds while it works, from mining-gates' `extractorWorkOf`, ticket 297), with a brass Mark plate under each cradle that holds a Mark-bearing
 * item, at the Mark the item acts at. It changes only when the loadout or a Mark does, so it renders through React; each asset shows in
 * `steampunkDebug.vehicleParts().mounted` while it is on the car. With no items, it draws nothing.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { showMountedParts } from '../../../scene/mountedPartsPresence'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { useGameStore } from '../../../store/gameStore'
import { atlasMapsOf, type AtlasMaps } from '../../../systems/art/assetLook'
import {
  carriedRigOfKey,
  readCarriedRigKey,
  readDeployFractionOf,
  readRigTick,
  rigSightOfCarried,
} from '../store/rigReads'
import { pivotedQuadOf, type RigMount } from '../systems/render/rigGear'
import type { GearQuad } from '../systems/render/techGearQuads'
import {
  createExtractorDeploy,
  deployRefOf,
  isAnyExtractorDeploying,
  stepExtractorDeploy,
  type ExtractorDeploy,
} from './extractorDeploy'
import { MarkPlateMesh } from './MarkPlateMesh'

export const RIG_GEAR_PIECE_ID = 'tech-tree.rig-gear'

/** The body's parts' layer, as `MountedParts` hangs gear: authored draw orders interleave. */
const RIG_Z = 0.1

export function RigGearPiece() {
  const rigKey = useGameStore(readCarriedRigKey)
  const sight = useMemo(() => rigSightOfCarried(SHIPPED_ART, carriedRigOfKey(rigKey)), [rigKey])
  const deploy = useMemo(createExtractorDeploy, [])
  const isDeploying = useMemo(() => isAnyExtractorDeploying(sight.mounts), [sight])
  useEffect(() => showRigMounts(sight.mounts), [sight])
  return (
    <>
      {sight.mounts.map((mount) => (
        <MountedGear key={`${mount.attachId} ${mount.assetId}`} mount={mount} deploy={deploy} />
      ))}
      {isDeploying && <ExtractorDeployDrive deploy={deploy} />}
      {sight.plates.map((plate) => (
        <MarkPlateMesh key={plate.slot} plate={plate} />
      ))}
    </>
  )
}

/** Only mounted while an extractor is on the car, so a rig without one steps nothing. */
function ExtractorDeployDrive({ deploy }: { deploy: ExtractorDeploy }) {
  useFrame(() => stepExtractorDeploy(deploy, readRigTick(), readDeployFractionOf))
  return null
}

function MountedGear({ mount, deploy }: { mount: RigMount; deploy: ExtractorDeploy }) {
  const maps = useMemo(() => atlasMapsOf(SHIPPED_ART, mount.assetId), [mount.assetId])
  return (
    <>
      {mount.quads.map((quad) => (
        <PosedGearQuad
          key={`${quad.partId} ${String(quad.mirrorY)}`}
          quad={quad}
          maps={maps}
          deploy={deploy}
        />
      ))}
    </>
  )
}

interface PosedGearQuadProps {
  quad: GearQuad
  maps: AtlasMaps | null
  deploy: ExtractorDeploy
}

/**
 * A part in a group at its pivot, turned and mirrored as its pose and the art say; an extractor
 * part's group is laid out folded and the deploy drive moves it.
 */
function PosedGearQuad({ quad, maps, deploy }: PosedGearQuadProps) {
  const posed = useMemo(() => pivotedQuadOf(quad), [quad])
  const deployRef = useMemo(() => deployRefOf(deploy, quad), [deploy, quad])
  return (
    <group
      ref={deployRef}
      position={[posed.pivot[0], posed.pivot[1], 0]}
      rotation={[0, 0, posed.turn]}
      scale={[1, posed.scaleY, 1]}
    >
      <PartQuadMesh quad={posed.quad} maps={maps} baseZ={RIG_Z} />
    </group>
  )
}

/** Lists every mount on the car; returns the call that takes them all back. */
function showRigMounts(mounts: readonly RigMount[]): () => void {
  const hides = mounts.map(({ assetId, attachId, quads }) =>
    showMountedParts({ assetId, attachId }, quads),
  )
  return () => hides.forEach((hide) => hide())
}
