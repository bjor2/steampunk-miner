/**
 * The `auto_guns` modules on the kernel's turret (ticket 321, #310 build 5): a vehicle piece that
 * hangs every bought turret module at its mount once the guns are mounted, the cupola's on the
 * still head and the barrel's on a group that turns as the kernel's `VehicleGuns` turns its
 * barrel: the same rule, the same aim and the same rate, so both swing together. The turn lives on
 * a ref, never in React or the store. With no module bought (all eight are held back until #388
 * registers them) it draws nothing and steps nothing.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Group } from 'three'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { readEnemies, readLocalVehicle, useGameStore } from '../../../store/gameStore'
import {
  createAimFrame,
  gunAimTurnOf,
  gunBarrelQuadsOf,
  gunTrunnionOf,
  stepGunTurn,
  type AimFrame,
} from '../../../systems/render/gunLook'
import { isGunOnAuto } from '../../../systems/vehicle/vehicleGun'
import { boughtModulesOfKey, readBoughtTurretModulesKey } from '../store/armouryReads'
import {
  barrelTipOf,
  modulesRiding,
  placedModulesOf,
  type BoughtModule,
} from '../systems/render/armouryMounts'
import { ArmouryModules } from './ArmouryModules'

export const TURRET_MODULES_PIECE_ID = 'ground-gun.turret-modules'

/** `VehicleGuns`' layer and rest, so the modules sit and swing with the turret. */
const TURRET_Z = 0.1
const REST_TURN = 0
const TURRET_ATTACH_ID = 'hull.turret'

export function TurretModulesPiece() {
  const gunLevel = useGameStore((state) => state.vehicle.gunLevel)
  const modulesKey = useGameStore(readBoughtTurretModulesKey)
  const bought = useMemo(() => boughtModulesOfKey(modulesKey), [modulesKey])
  const barrels = useMemo(() => gunBarrelQuadsOf(SHIPPED_ART, gunLevel), [gunLevel])
  if (barrels.length === 0 || bought.length === 0) return null
  return <TurretModules gunLevel={gunLevel} bought={bought} />
}

function TurretModules({ gunLevel, bought }: { gunLevel: number; bought: BoughtModule[] }) {
  const placed = useMemo(() => turretModulesOf(gunLevel, bought), [gunLevel, bought])
  const head = useMemo(() => modulesRiding(placed, 'head'), [placed])
  const onBarrel = useMemo(() => modulesRiding(placed, 'barrel'), [placed])
  const trunnion = gunTrunnionOf(SHIPPED_ART, gunLevel)
  const barrel = useRef<Group>(null)
  const turn = useRef(REST_TURN)
  const frame = useMemo(createAimFrame, [])
  useFrame((_, delta) => {
    turn.current = stepGunTurn(turn.current, aimTurnNow(frame), delta)
    barrel.current?.rotation.set(0, 0, turn.current)
  })
  return (
    <group position={[trunnion[0], trunnion[1], 0]}>
      <ArmouryModules modules={head} attachId={TURRET_ATTACH_ID} baseZ={TURRET_Z} />
      <group ref={barrel}>
        <ArmouryModules modules={onBarrel} attachId={TURRET_ATTACH_ID} baseZ={TURRET_Z} />
      </group>
    </group>
  )
}

/** The bought modules on the turret, a muzzle mount at the tip of the barrel look drawn now. */
function turretModulesOf(gunLevel: number, bought: readonly BoughtModule[]) {
  const muzzleX = barrelTipOf(gunBarrelQuadsOf(SHIPPED_ART, gunLevel))
  return placedModulesOf(SHIPPED_ART, 'turret', bought, muzzleX)
}

/** `VehicleGuns`' aim: towards the guns' target while on Auto, else back to rest. */
function aimTurnNow(frame: AimFrame): number {
  const vehicle = readLocalVehicle()
  if (vehicle.pose === null || !isGunOnAuto(vehicle.gun)) return REST_TURN
  return gunAimTurnOf(vehiclePresence, vehicle.pose.facing, readEnemies(), frame) ?? REST_TURN
}
