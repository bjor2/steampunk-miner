/**
 * The vehicle's Rapier body under React: created once in the R3F physics world, driven once per
 * fixed step by the vehicle controller, and drawn each frame between its pose before and after
 * the last step by the step blend, so it glides on every frame instead of jumping on the frames
 * that complete a step (presentation only; nothing per-frame reaches React state). The drawn car
 * is shifted by the dock building's staging (#170 auto-roll) and turned about its own up axis on a
 * turntable (#180), which never moves or turns the body. The body is measured from the render origin
 * (ticket 339); the car is drawn in planet metres under the scene's world root, and the origin it was
 * drawn from is published with it, so the root, the camera and the particles move the same frame.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Quaternion, Vector3, type Group } from 'three'
import { BODY_DRAW_FRAME_PRIORITY, MM_PER_METRE } from '../constants/physics'
import { turnedWidthShareOf } from '../systems/render/stagedTurn'
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
  /** Written every frame with where the car is drawn, for the camera, terrain and lighting. */
  presence: { x: number; y: number }
  /** Written every frame with the render origin in metres, for the world root and the camera. */
  origin: { x: number; y: number }
  /** Where the car is drawn from the body, and its turn; none unless a dock building stages it. */
  stage: DrawStaging
  children: (controller: VehicleController) => ReactNode
}

interface DrawStaging {
  drawOffsetX: number
  drawOffsetY: number
  rotation: number
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

/** The two poses a frame draws the body between, kept for the body's life (no per-frame allocation). */
interface StepPoses {
  stepStart: DrawnPose
  latest: DrawnPose
}

export function VehicleBody({
  startPose,
  onFixedStep,
  presence,
  origin,
  stage,
  children,
}: VehicleBodyProps) {
  const { world, rapier } = useRapier()
  const group = useRef<Group>(null)
  const [mounted, setMounted] = useState<MountedVehicle | null>(null)
  const poses = useMemo(createStepPoses, [])

  useEffect(() => {
    const placed = createVehicleBody(rapier, world, startPose)
    const controller = createVehicleController(rapier, world, placed)
    const { body } = placed
    readBodyPose(body, poses.stepStart)
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
    readBodyPose(mounted.body, poses.stepStart)
  })

  useFrame(() => {
    if (mounted !== null && group.current !== null)
      drawBetweenSteps(mounted, poses, group.current, { presence, origin }, stage)
  }, BODY_DRAW_FRAME_PRIORITY)

  return <group ref={group}>{mounted === null ? null : children(mounted.controller)}</group>
}

function createStepPoses(): StepPoses {
  return { stepStart: createDrawnPose(), latest: createDrawnPose() }
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

/** Where the drawn car and the origin it was measured from are published each frame. */
interface DrawnPresence {
  presence: { x: number; y: number }
  origin: { x: number; y: number }
}

function drawBetweenSteps(
  mounted: MountedVehicle,
  poses: StepPoses,
  group: Group,
  drawn: DrawnPresence,
  stage: DrawStaging,
): void {
  readBodyPose(mounted.body, poses.latest)
  blendStepPoses(poses.stepStart, poses.latest, group)
  measureFromPlanetCentre(group, mounted.controller, drawn.origin)
  stageDrawnCar(group, stage)
  drawn.presence.x = group.position.x
  drawn.presence.y = group.position.y
}

/** Both step poses are read after the step's re-centring, so they share the origin added here. */
function measureFromPlanetCentre(
  group: Group,
  controller: VehicleController,
  origin: { x: number; y: number },
): void {
  const { xMm, yMm } = controller.renderOrigin()
  origin.x = xMm / MM_PER_METRE
  origin.y = yMm / MM_PER_METRE
  group.position.x += origin.x
  group.position.y += origin.y
}

/** The body's place and turn `stepBlend.share` of the way through the last step. */
function blendStepPoses(stepStart: DrawnPose, latest: DrawnPose, group: Group): void {
  group.position.lerpVectors(stepStart.position, latest.position, stepBlend.share)
  group.quaternion.slerpQuaternions(stepStart.quaternion, latest.quaternion, stepBlend.share)
}

function stageDrawnCar(group: Group, stage: DrawStaging): void {
  group.position.x += stage.drawOffsetX
  group.position.y += stage.drawOffsetY
  group.scale.x = turnedWidthShareOf(stage.rotation)
}
