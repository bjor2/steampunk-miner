/**
 * The vehicle's Rapier body under React: created once in the R3F physics world, driven once per
 * fixed step by the vehicle controller, and drawn each frame between its pose before and after
 * the last step by the step blend, so it glides on every frame instead of jumping on the frames
 * that complete a step (presentation only; nothing per-frame reaches React state).
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Quaternion, Vector3, type Group } from 'three'
import { BODY_DRAW_FRAME_PRIORITY } from '../constants/physics'
import type { VehiclePose } from '../systems/vehicle/vehiclePose'
import { stepBlend } from './stepBlend'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
} from './vehicleController'

interface VehicleBodyProps {
  startPose: VehiclePose
  /** Called once per fixed step, before the world steps, with the one writer of the motion. */
  onFixedStep: (controller: VehicleController) => void
  /** Written every frame with where the body is drawn, for the camera, terrain and lighting. */
  presence: { x: number; y: number }
  children: (controller: VehicleController) => ReactNode
}

interface MountedVehicle {
  body: RAPIER.RigidBody
  controller: VehicleController
}

/** A body transform in three's terms: the pose a step starts from, or scratch for the latest. */
interface DrawnPose {
  position: Vector3
  quaternion: Quaternion
}

export function VehicleBody({ startPose, onFixedStep, presence, children }: VehicleBodyProps) {
  const { world, rapier } = useRapier()
  const group = useRef<Group>(null)
  const [mounted, setMounted] = useState<MountedVehicle | null>(null)
  const stepStart = useMemo(createDrawnPose, [])
  const latest = useMemo(createDrawnPose, [])

  useEffect(() => {
    const body = createVehicleBody(rapier, world, startPose)
    const controller = createVehicleController(rapier, world, body)
    readBodyPose(body, stepStart)
    setMounted({ body, controller })
    return () => {
      controller.dispose()
      world.removeRigidBody(body)
    }
    // The body is created once per physics world; a later start pose is a placeAt, not a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, rapier])

  // Read after the controller, so a tow or travel placement starts the step where it lands.
  useBeforePhysicsStep(() => {
    if (mounted === null) return
    onFixedStep(mounted.controller)
    readBodyPose(mounted.body, stepStart)
  })

  useFrame(() => {
    if (mounted !== null && group.current !== null)
      drawBetweenSteps(mounted.body, stepStart, latest, group.current, presence)
  }, BODY_DRAW_FRAME_PRIORITY)

  return <group ref={group}>{mounted === null ? null : children(mounted.controller)}</group>
}

function createDrawnPose(): DrawnPose {
  return { position: new Vector3(), quaternion: new Quaternion() }
}

function readBodyPose(body: RAPIER.RigidBody, into: DrawnPose): void {
  const position = body.translation()
  const rotation = body.rotation()
  into.position.set(position.x, position.y, 0)
  into.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
}

function drawBetweenSteps(
  body: RAPIER.RigidBody,
  stepStart: DrawnPose,
  latest: DrawnPose,
  group: Group,
  presence: { x: number; y: number },
): void {
  readBodyPose(body, latest)
  group.position.lerpVectors(stepStart.position, latest.position, stepBlend.share)
  group.quaternion.slerpQuaternions(stepStart.quaternion, latest.quaternion, stepBlend.share)
  presence.x = group.position.x
  presence.y = group.position.y
}
