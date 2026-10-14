/**
 * The Engineering Works' idle life (ticket 395): the turntable turns slowly until a car docks on
 * it, the gantry arm sways about its root bearing, and the stacks vent steam. The two moving parts
 * are the art's own (`workshop-gantry`, `workshop-turntable`); this owns the clock they share and
 * steps it once a frame on the render delta, presentation only. With motion effects off (#33) the
 * turntable and the arm hold still; the steam still rises, as the Refinery's smoke does.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { useGameStore } from '../../../store/gameStore'
import { readDockedBay } from '../../../store/screenReads'
import type { AssetQuad, AtlasMaps } from '../../../systems/art/assetLook'
import type { AttachPoint } from '../../../systems/art/partsSidecar'
import { stepTurntableSpin } from '../systems/render/turntableSpin'
import { gantrySwayAt } from '../systems/render/worksIdle'
import { TurntableBand } from './TurntableBand'
import { worksIdleNow } from './worksIdleNow'
import { WorksSteam } from './WorksSteam'

/** The Works' moving parts and the stack the steam leaves from, in the building's frame. */
export interface WorksIdleLook {
  gantry: AssetQuad
  turntable: AssetQuad
  stack: AttachPoint
  maps: AtlasMaps | null
}

export function WorksIdle({ look, baseZ }: { look: WorksIdleLook; baseZ: number }) {
  useFrame((_, delta) => advanceWorksIdle(delta))
  return (
    <>
      <SwayingGantry quad={look.gantry} maps={look.maps} baseZ={baseZ} />
      <TurntableBand quad={look.turntable} maps={look.maps} baseZ={baseZ} />
      <WorksSteam stack={look.stack} baseZ={baseZ} />
    </>
  )
}

/** The arm turned about its root bearing, the part's own pivot. */
function SwayingGantry({
  quad,
  maps,
  baseZ,
}: {
  quad: AssetQuad
  maps: AtlasMaps | null
  baseZ: number
}) {
  const group = useRef<Group>(null)
  useFrame(() => swayGantry(group.current))
  const [pivotX, pivotY] = quad.pivot
  return (
    <group ref={group} position={[pivotX, pivotY, 0]}>
      <group position={[-pivotX, -pivotY, 0]}>
        <PartQuadMesh quad={quad} maps={maps} baseZ={baseZ} />
      </group>
    </group>
  )
}

function advanceWorksIdle(dt: number): void {
  worksIdleNow.seconds += dt
  stepTurntableSpin(worksIdleNow.spin, isTurntableHeld(), dt)
  worksIdleNow.gantryRadians = isMotionReduced() ? 0 : gantrySwayAt(worksIdleNow.seconds)
}

/** A docked car stands on the turntable; with motion effects off nothing turns. */
function isTurntableHeld(): boolean {
  return isMotionReduced() || readDockedBay() === 'upgrade'
}

/** The shake switch is the motion switch too (#33, #48 acceptance 6), as for the vehicle's parts. */
function isMotionReduced(): boolean {
  return !useGameStore.getState().prefs.shake
}

function swayGantry(group: Group | null): void {
  if (group !== null) group.rotation.z = worksIdleNow.gantryRadians
}
