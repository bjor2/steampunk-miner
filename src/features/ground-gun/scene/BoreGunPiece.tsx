/**
 * The bore gun on the rig (ticket 315, #309 GD decision build 3): a vehicle piece (#235) that
 * hangs `vehicle-bore-gun` at its attach use's point once the gun is mounted, so buying it shows
 * on the vehicle. The saddle renders through React, as it changes only when the gun is bolted on;
 * the barrel swings each frame towards the bearing the gun would fire along now, its turn on a ref
 * that never goes through React or the store. Every bought Armoury module rides the barrel at its
 * mount (ticket 321), gilded once Mastered. Listed in `steampunkDebug.vehicleParts().mounted`
 * while on the car.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { PartQuadMesh } from '../../../scene/PartQuadMesh'
import { showMountedParts } from '../../../scene/mountedPartsPresence'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { useGameStore } from '../../../store/gameStore'
import type { PartMount } from '../../../systems/render/mountedPartLook'
import { boughtModulesOfKey, readBoughtBoreModulesKey } from '../store/armouryReads'
import { readBarrelBearing } from '../store/fireInput'
import { readIsGunMounted } from '../store/fireTileReads'
import {
  barrelTurnOf,
  boreGunMaps,
  boreGunMountOf,
  boreGunQuadsOf,
  stepBarrelTurn,
  type BoreGunQuads,
} from '../systems/render/boreGunLook'
import { modulesRiding, placedModulesOf } from '../systems/render/armouryMounts'
import { ArmouryModules } from './ArmouryModules'

export const BORE_GUN_PIECE_ID = 'ground-gun.bore-gun'

/** The body's parts' layer, so the gun's authored draw orders interleave with the body's. */
const GUN_Z = 0.1
const REST_TURN = 0
const maps = boreGunMaps(SHIPPED_ART)

export function BoreGunPiece() {
  const isMounted = useGameStore(readIsGunMounted)
  const mount = useMemo(boreGunMountOf, [])
  if (!isMounted || mount === null) return null
  return <MountedBoreGun mount={mount} />
}

function MountedBoreGun({ mount }: { mount: PartMount }) {
  const quads = useMemo(() => boreGunQuadsOf(SHIPPED_ART, mount), [mount])
  const modulesKey = useGameStore(readBoughtBoreModulesKey)
  // Every bore mount rides the barrel (armouryMounts.json), so all of them turn with it.
  const modules = useMemo(
    () =>
      modulesRiding(placedModulesOf(SHIPPED_ART, 'bore', boughtModulesOfKey(modulesKey)), 'barrel'),
    [modulesKey],
  )
  const barrel = useRef<Group>(null)
  const turn = useRef(REST_TURN)
  useEffect(() => showGunParts(mount, quads), [mount, quads])
  useFrame((_, delta) => {
    turn.current = stepBarrelTurn(turn.current, barrelTurnOf(readBarrelBearing()), delta)
    barrel.current?.rotation.set(0, 0, turn.current)
  })
  return (
    <>
      {quads.fixed.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={GUN_Z} />
      ))}
      <group ref={barrel} position={[quads.trunnion[0], quads.trunnion[1], 0]}>
        {quads.barrel.map((quad) => (
          <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={GUN_Z} />
        ))}
        <ArmouryModules modules={modules} attachId={mount.attachId} baseZ={GUN_Z} />
      </group>
    </>
  )
}

/** Lists the gun's parts on the car; returns the call that takes them back. */
function showGunParts(mount: PartMount, quads: BoreGunQuads): () => void {
  return showMountedParts(mount, [...quads.fixed, ...quads.barrel])
}
