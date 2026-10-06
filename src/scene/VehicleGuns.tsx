/**
 * The `auto_guns` turret on the run vehicle (#107, #81 acceptance 3): drawn in the vehicle's body
 * frame while the guns are mounted, its barrel look following the gun level (#108). The barrel
 * swings each frame towards the enemy the guns would shoot while they are on Auto, and back to
 * rest otherwise; its turn lives on a ref and never goes through React or the store.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { readEnemies, readLocalVehicle, useGameStore } from '../store/gameStore'
import { atlasMapsOf } from '../systems/art/assetLook'
import {
  createAimFrame,
  GUN_ASSET_ID,
  gunAimTurnOf,
  gunBarrelQuadsOf,
  gunFixedQuadsOf,
  gunTrunnionOf,
  stepGunTurn,
  type AimFrame,
} from '../systems/render/gunLook'
import { isGunOnAuto } from '../systems/vehicle/vehicleGun'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'
import { vehiclePresence } from './vehiclePresence'

/** The body's parts' layer; the turret's own draw order puts it over every vehicle part. */
const TURRET_Z = 0.1
const REST_TURN = 0
const maps = atlasMapsOf(SHIPPED_ART, GUN_ASSET_ID)

export function VehicleGuns() {
  const gunLevel = useGameStore((state) => state.vehicle.gunLevel)
  const fixed = useMemo(() => gunFixedQuadsOf(SHIPPED_ART, gunLevel), [gunLevel])
  const barrels = useMemo(() => gunBarrelQuadsOf(SHIPPED_ART, gunLevel), [gunLevel])
  const trunnion = gunTrunnionOf(SHIPPED_ART, gunLevel)
  const barrel = useRef<Group>(null)
  const turn = useRef(REST_TURN)
  const frame = useMemo(createAimFrame, [])
  useFrame((_, delta) => {
    turn.current = stepGunTurn(turn.current, aimTurnNow(frame), delta)
    barrel.current?.rotation.set(0, 0, turn.current)
  })
  return (
    <>
      {fixed.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={TURRET_Z} />
      ))}
      <group ref={barrel} position={[trunnion[0], trunnion[1], 0]}>
        {barrels.map((quad) => (
          <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={TURRET_Z} />
        ))}
      </group>
    </>
  )
}

/** Towards the guns' target while on Auto, else back to rest. */
function aimTurnNow(frame: AimFrame): number {
  const vehicle = readLocalVehicle()
  if (vehicle.pose === null || !isGunOnAuto(vehicle.gun)) return REST_TURN
  return gunAimTurnOf(vehiclePresence, vehicle.pose.facing, readEnemies(), frame) ?? REST_TURN
}
