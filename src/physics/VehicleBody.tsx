/**
 * The vehicle's Rapier body under React: created once in the R3F physics world, driven once per
 * fixed step by the vehicle controller, and drawn by copying the body's transform onto a group
 * each frame (presentation only; nothing per-frame reaches React state).
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'
import type { VehiclePose } from '../systems/vehicle/vehiclePose'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
} from './vehicleController'

interface VehicleBodyProps {
  startPose: VehiclePose
  /** Called once per fixed step, before the world steps, with the one writer of the motion. */
  onFixedStep: (controller: VehicleController) => void
  /** Written every frame with the body's position, for the camera and the tile view. */
  presence: { x: number; y: number }
  children: (controller: VehicleController) => ReactNode
}

interface MountedVehicle {
  body: RAPIER.RigidBody
  controller: VehicleController
}

export function VehicleBody({ startPose, onFixedStep, presence, children }: VehicleBodyProps) {
  const { world, rapier } = useRapier()
  const group = useRef<Group>(null)
  const [mounted, setMounted] = useState<MountedVehicle | null>(null)

  useEffect(() => {
    const body = createVehicleBody(rapier, world, startPose)
    const controller = createVehicleController(rapier, world, body)
    setMounted({ body, controller })
    return () => {
      controller.dispose()
      world.removeRigidBody(body)
    }
    // The body is created once per physics world; a later start pose is a placeAt, not a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, rapier])

  useBeforePhysicsStep(() => {
    if (mounted !== null) onFixedStep(mounted.controller)
  })

  useFrame(() => {
    if (mounted !== null && group.current !== null)
      copyBodyTransform(mounted.body, group.current, presence)
  })

  return <group ref={group}>{mounted === null ? null : children(mounted.controller)}</group>
}

function copyBodyTransform(
  body: RAPIER.RigidBody,
  group: Group,
  presence: { x: number; y: number },
) {
  const position = body.translation()
  const rotation = body.rotation()
  group.position.set(position.x, position.y, 0)
  group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
  presence.x = position.x
  presence.y = position.y
}
