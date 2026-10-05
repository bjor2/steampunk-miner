/**
 * The vehicle's motor: the ONLY writer of the vehicle body's motion. Once per fixed physics step,
 * before the world steps, it reads the body, keeps the tile halo around it, applies one step of
 * the pure motion rule by velocity (never by teleporting), keeps the body upright along
 * `localUp`, swivels the drill head, and says which actions were active and where it stands, for
 * the pose report. The same code runs under React (`VehicleBody`) and in the node physics specs.
 *
 * The world here is 3D Rapier used as 2D (CLAUDE.md): Z translation is locked, only rotation
 * about Z is free, and world gravity is zero because gravity is radial (#7).
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { PHYSICS_TIMESTEP, VEHICLE_COLLIDER_SIZE } from '../constants/physics'
import type { EngineStats } from '../systems/economy/vehicleStats'
import {
  isHeadSettled,
  newDrillHead,
  settledFacingOf,
  stepDrillHead,
  type DrillHead,
} from '../systems/vehicle/drillHead'
import { localUpOf, type Vector2 } from '../systems/vehicle/localFrame'
import type { ActionFlags } from '../systems/vehicle/poseReport'
import { quantisePose } from '../systems/vehicle/poseReport'
import { gravityAt } from '../systems/vehicle/radialGravity'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { groundProbeOf, stepVehicleMotion } from '../systems/vehicle/vehicleMotion'
import {
  FACING,
  noseTileOf,
  tileOfMillimetres,
  type VehiclePose,
} from '../systems/vehicle/vehiclePose'
import type { TilePoint } from '../systems/world/tileGrid'
import { isRemovableCell, isSolidCell } from '../systems/world/worldCell'
import { createTileHalo } from './tileHalo'

type Rapier = typeof RAPIER

/** What the controller needs to know about the planet: its size, its gravity, its tiles now. */
export interface PlanetView {
  radiusTiles: number
  gravityMultiplier: number
  /** The world state object; a new identity means tiles changed and the halo is rebuilt. */
  worldVersion: unknown
  cellAt(tile: TilePoint): number
}

export interface VehicleStepInput {
  intent: VehicleIntent
  engine: EngineStats
  /** Active with energy left (#7): otherwise the wheels, lift and drill do nothing. */
  canAct: boolean
}

export interface VehicleStepResult {
  flags: ActionFlags
  pose: VehiclePose
}

export interface VehicleController {
  /** Call once per fixed step, before the world steps. */
  step(input: VehicleStepInput, planet: PlanetView): VehicleStepResult
  /** A respawn on the dock after the tow or a planet change: the one time the body is placed. */
  placeAt(pose: VehiclePose): void
  drillHead(): DrillHead
  colliderCount(): number
  dispose(): void
}

/** Tiles of halo around the vehicle's tile; at 0.27 m per step it never outruns 4 tiles. */
export const TILE_HALO_RADIUS = 4

/** Share of the remaining tilt removed per step; under 1 so contact pushes settle smoothly. */
const RIGHTING_GAIN = 0.5

const MM = 1000

// Reused every physics step: setLinvel and setAngvel copy what they are given.
const scratchVelocity = { x: 0, y: 0, z: 0 }
const scratchSpin = { x: 0, y: 0, z: 0 }

export function createVehicleBody(
  rapier: Rapier,
  world: RAPIER.World,
  pose: VehiclePose,
): RAPIER.RigidBody {
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(pose.x / MM, pose.y / MM, 0)
      .enabledTranslations(true, true, false)
      .enabledRotations(false, false, true)
      .setGravityScale(0)
      .setCanSleep(false),
  )
  const half = VEHICLE_COLLIDER_SIZE / 2
  world.createCollider(rapier.ColliderDesc.cuboid(half, half, half).setFriction(0), body)
  return body
}

export function createVehicleController(
  rapier: Rapier,
  world: RAPIER.World,
  body: RAPIER.RigidBody,
): VehicleController {
  const halo = createTileHalo(rapier, world, TILE_HALO_RADIUS)
  let head = newDrillHead(FACING.right)
  let up: Vector2 = { x: 0, y: 1 }

  return {
    step(input, planet) {
      const position = vectorOf(body.translation())
      up = localUpOf(position, up)
      halo.syncAround(tileOfMetres(position), planet.worldVersion, (tile) =>
        isSolidCell(planet.cellAt(tile)),
      )
      const motion = stepVehicleMotion({
        velocity: vectorOf(body.linvel()),
        up,
        gravity: gravityAt(position, planet.radiusTiles, planet.gravityMultiplier),
        intent: input.intent,
        engine: input.engine,
        canAct: input.canAct,
        isGrounded: isSolidCell(planet.cellAt(tileOfMetres(groundProbeOf(position, up)))),
        dt: PHYSICS_TIMESTEP,
      })
      driveBody(body, motion.velocity, up)
      head = stepDrillHead(head, input.intent.facing)
      const pose = quantisePose(position, motion.velocity, up, settledFacingOf(head))
      const isDrilling = input.canAct && isPushingIntoTile(input.intent, head, pose, planet)
      return {
        flags: { isDriving: motion.isDriving, isThrusting: motion.isThrusting, isDrilling },
        pose,
      }
    },
    placeAt(pose) {
      body.setTranslation({ x: pose.x / MM, y: pose.y / MM, z: 0 }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      head = newDrillHead(pose.facing)
    },
    drillHead: () => head,
    colliderCount: () => halo.colliderCount(),
    dispose: () => halo.dispose(),
  }
}

/**
 * Drilling auto-engages when the player pushes into a solid tile the settled head faces (#7):
 * the held aim matches the facing and the tile at the nose can be removed.
 */
function isPushingIntoTile(
  intent: VehicleIntent,
  head: DrillHead,
  pose: VehiclePose,
  planet: PlanetView,
): boolean {
  const isAimingAtFacing = intent.facing === pose.facing && isHeadSettled(head)
  return isAimingAtFacing && isRemovableCell(planet.cellAt(noseTileOf(pose)))
}

/** Motion by velocity; the spin turns the body toward `localUp` (the righting torque of #7). */
function driveBody(body: RAPIER.RigidBody, velocity: Vector2, up: Vector2): void {
  scratchVelocity.x = velocity.x
  scratchVelocity.y = velocity.y
  body.setLinvel(scratchVelocity, true)
  scratchSpin.z = (tiltOf(body.rotation(), up) * RIGHTING_GAIN) / PHYSICS_TIMESTEP
  body.setAngvel(scratchSpin, true)
}

/** The signed angle from the body's up to `localUp`, about Z, in (-pi, pi]. */
function tiltOf(rotation: RAPIER.Rotation, up: Vector2): number {
  const bodyAngle = 2 * Math.atan2(rotation.z, rotation.w)
  const targetAngle = Math.atan2(-up.x, up.y)
  const turn = targetAngle - bodyAngle
  return Math.atan2(Math.sin(turn), Math.cos(turn))
}

function vectorOf(vector: { x: number; y: number }): Vector2 {
  return { x: vector.x, y: vector.y }
}

function tileOfMetres(position: Vector2): TilePoint {
  return tileOfMillimetres(Math.round(position.x * MM), Math.round(position.y * MM))
}
