import { describe, expect, it } from 'vitest'
import { BASIS_POINTS } from '../../../constants/balance'
import { BASE_GRAVITY, MM_PER_METRE, PHYSICS_TIMESTEP } from '../../../constants/physics'
import { ECONOMY } from '../../economy/economy'
import { chargeRadiusMm, chargeSizeCount, fuseTicksOf } from '../../economy/chargeSizes'
import type { EngineStats } from '../../economy/vehicleStats'
import type { Vector2 } from '../../vehicle/localFrame'
import { boostedEngineOf, PLAIN_MOTION } from '../../vehicle/motionEffects'
import type { VehicleIntent } from '../../vehicle/vehicleIntent'
import { stepVehicleMotion } from '../../vehicle/vehicleMotion'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import { freshPlanetParamsFor } from '../../world/planetParams'
import { createAuthorityState } from '../authorityState'
import { WORLD_SEED } from '../scriptedSession'

// The back-out test of D1 (ticket 860): planted from the tile beside it, the planter of every fused
// size clears the rung's own radius + 1 tile (the danger zone and the interlock, which no Blast
// Radius level grows) before the fuse runs out, at the slowest setup a player owns. The fuel tank
// and the hold weigh nothing in the motion rule, so the slowest owned setup is the starting engine;
// a wide rig's tool trade-off can hold the drive at its floor (ticket 848). A size that missed would
// take a longer fuse in data, never a slower blast.

const UP: Vector2 = { x: 0, y: 1 }
/** The planter's centre starts on the tile beside the charge's. */
const START_METRES = 1
const FULL_PUSH = 64
const LAST_PLANET = 40

const fusedSizes = () =>
  Array.from({ length: chargeSizeCount() }, (_, at) => at + 1).filter(
    (size) => fuseTicksOf(size) !== null,
  )

/** The engine a new vehicle starts with: level 1 of every track. */
function startingEngine(): EngineStats {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  return statsOfVehicle(start.players.p1.vehicle).engine
}

/** The drive at the lowest share any tool trade-off may leave it. */
function engineAtDriveFloor(engine: EngineStats): EngineStats {
  const driveBoostBp = ECONOMY.itemEffectCaps.toolFloorMinBp - BASIS_POINTS
  return boostedEngineOf(engine, { ...PLAIN_MOTION, driveBoostBp })
}

/** The heaviest surface pull of planets 1 to 40, in m/s². */
function heaviestGravity(): number {
  const multipliers = Array.from(
    { length: LAST_PLANET },
    (_, at) => freshPlanetParamsFor(WORLD_SEED, at + 1).gravityMultiplier,
  )
  return BASE_GRAVITY * Math.max(...multipliers)
}

/** Ticks until the planter has moved `metres` from its start, driving or climbing from rest. */
function ticksToCover(metres: number, engine: EngineStats, move: 'drive' | 'climb'): number {
  const intent: VehicleIntent =
    move === 'drive'
      ? { moveX: -FULL_PUSH, aim: null, lift: false }
      : { moveX: 0, aim: null, lift: true }
  let velocity: Vector2 = { x: 0, y: 0 }
  let travelled = 0
  for (let tick = 1; tick <= 10_000; tick++) {
    velocity = stepVehicleMotion({
      velocity,
      up: UP,
      gravity: move === 'climb' ? { x: 0, y: -heaviestGravity() } : { x: 0, y: 0 },
      intent,
      engine,
      canAct: true,
      isGrounded: move === 'drive',
      boreOffset: move === 'climb' ? 0 : null,
      isCuttingLevel: false,
      isWaitingForCut: false,
      dt: PHYSICS_TIMESTEP,
    }).velocity
    travelled += Math.abs(move === 'drive' ? velocity.x : velocity.y) * PHYSICS_TIMESTEP
    if (travelled > metres) return tick
  }
  return Number.POSITIVE_INFINITY
}

/** Metres from the start to past the rung's radius + 1 tile. */
function backOutMetres(size: number): number {
  return (chargeRadiusMm(size) + MM_PER_METRE) / MM_PER_METRE - START_METRES
}

describe('charge back-out (ticket 860)', () => {
  it('backs the starting engine out of every fused size along the ground before the fuse ends', () => {
    for (const size of fusedSizes()) {
      const ticks = ticksToCover(backOutMetres(size), startingEngine(), 'drive')
      expect({ size, isClear: ticks < (fuseTicksOf(size) as number) }).toEqual({
        size,
        isClear: true,
      })
    }
  })

  it('backs a wide rig out at its lowest drive before the fuse ends', () => {
    const engine = engineAtDriveFloor(startingEngine())
    for (const size of fusedSizes()) {
      const ticks = ticksToCover(backOutMetres(size), engine, 'drive')
      expect({ size, isClear: ticks < (fuseTicksOf(size) as number) }).toEqual({
        size,
        isClear: true,
      })
    }
  })

  it('climbs the starting engine out of a shaft under the heaviest pull of planets 1 to 40 in time', () => {
    for (const size of fusedSizes()) {
      const ticks = ticksToCover(backOutMetres(size), startingEngine(), 'climb')
      expect({ size, isClear: ticks < (fuseTicksOf(size) as number) }).toEqual({
        size,
        isClear: true,
      })
    }
  })

  it('judges sizes 1 to 6, the fused ones; 7 to 12 wait for the plunger and its interlock', () => {
    expect(fusedSizes()).toEqual([1, 2, 3, 4, 5, 6])
  })
})
