/**
 * What each mobility item does when its wind-up ends (#162 section 1 rows, section 4 numbers):
 * it opens a window in the player's `mobility` section, which the kernel seams read (ticket 233).
 * None of them changes a cell, so none is ever refused by a gate (GD lock on #204 Q5); a grapple
 * with no hook, or a second rivet patch while one holds, is refused and costs nothing.
 *
 * The toggles (grav anchor, buoyancy tanks) do nothing here: `power-up-core` switches them, and
 * their effect reads the switch.
 *
 * Each window, burst or reach is the use's magnitude: the item's ladder at the Mark researched when
 * it acts (#249, `markLadders.ts`), or its #162 number when the use carries none.
 */
import { BASIS_POINTS } from '../../../constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged } from '../../../systems/authority/commandRule'
import {
  facingVectorOf,
  FACING,
  type IntegerVector,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { grappleHookOf, type GrappleHook } from './grappleHook'
import { grappleHookedOf, NO_HOOK } from './mobilityEvents'
import { MOBILITY_ECONOMY, type BurstNumbers } from './mobilityEconomy'
import {
  mobilityOf,
  unsettledHeatSinksOf,
  updateMobility,
  type BurstWindow,
  type MobilityState,
} from './mobilitySection'

/** Why a use with the miner out of play, or a second patch, is refused. */
export const OUT_OF_PLAY = 'mobility.out_of_play'
export const PATCH_HOLDING = 'mobility.patch_holding'

const NUMBERS = MOBILITY_ECONOMY

type Activate = (state: AuthorityState, use: PowerUpUse) => PowerUpOutcome

/** Fire at a wall or ceiling in range and reel the miner to it. */
export const fireGrapple: Activate = (state, use) => {
  const pose = vehicleOf(state, use.playerId).pose
  if (pose === null) return { kind: 'refused', reason: OUT_OF_PLAY }
  const reach = { ...NUMBERS.grapple, rangeTiles: magnitudeOf(use, NUMBERS.grapple.rangeTiles) }
  const hook = grappleHookOf(state, pose, reach)
  if (hook === null) return { kind: 'refused', reason: NO_HOOK }
  return actedWith(state, use, (value) => ({ ...value, reel: reelOf(state, use, hook) }), [
    grappleHookedOf(use.playerId, hook.hook, hook.to),
  ])
}

/** Lighter for a short time, so thrust climbs even on low energy. */
export const dropBallast: Activate = (state, use) =>
  actedWith(state, use, (value) => ({
    ...value,
    ballastUntilTick: use.tick + magnitudeOf(use, NUMBERS.ballast.windowTicks),
  }))

/** Dumps a share of the heat gauge at once and pauses heat gain for a while. */
export const ventHeatSink: Activate = (state, use) => {
  const settledTick = vehicleOf(state, use.playerId).heat.settledTick
  const fromTick = Math.max(use.tick, settledTick)
  const window = {
    fromTick,
    untilTick: fromTick + magnitudeOf(use, NUMBERS.heatSink.pauseTicks),
    ventBp: NUMBERS.heatSink.ventBp,
    gainBp: NUMBERS.heatSink.gainBp,
  }
  return actedWith(state, use, (value) => ({
    ...value,
    heatSinks: [...unsettledHeatSinksOf(value, settledTick), window],
  }))
}

/** A short burst of speed in the steering direction, sideways or up. */
export const blowSteamBoost: Activate = (state, use) =>
  burstWith(state, use, NUMBERS.steamBoost, steeringDirectionOf, (value, boost) => ({
    ...value,
    boost,
  }))

/** One long burst up the shaft; it stops at the first solid cell (`mobilityMotion.ts`). */
export const fireEscapeThruster: Activate = (state, use) =>
  burstWith(state, use, NUMBERS.escapeThruster, upOf, (value, escape) => ({ ...value, escape }))

/** A steam curtain for a short window: enemy hits and collapse crush are turned aside. */
export const raiseSteamShield: Activate = (state, use) =>
  actedWith(state, use, (value) => ({
    ...value,
    shieldUntilTick: use.tick + magnitudeOf(use, NUMBERS.steamShield.windowTicks),
  }))

/** A cloud where the miner stands that breaks enemy detection in its radius for a while. */
export const burstSmokeCanister: Activate = (state, use) => {
  const pose = vehicleOf(state, use.playerId).pose
  if (pose === null) return { kind: 'refused', reason: OUT_OF_PLAY }
  const smoke = {
    x: pose.x,
    y: pose.y,
    untilTick: use.tick + magnitudeOf(use, NUMBERS.smoke.windowTicks),
  }
  return actedWith(state, use, (value) => ({ ...value, smoke }))
}

/** The hull is plated once the miner has held still for the whole hold (`rivetPatch.ts`). */
export const startRivetPatch: Activate = (state, use) => {
  if (mobilityOf(state, use.playerId).patch !== null) {
    return { kind: 'refused', reason: PATCH_HOLDING }
  }
  const patch = {
    finishTick: use.tick + NUMBERS.rivetPatch.holdTicks,
    expectedEnergy: vehicleOf(state, use.playerId).energy,
  }
  return actedWith(state, use, (value) => ({ ...value, patch }))
}

/** A toggle's switch is `power-up-core`'s; turning it on changes nothing here. */
export const switchToggle: Activate = (state) => ({ kind: 'acted', effect: unchanged(state) })

function actedWith(
  state: AuthorityState,
  use: PowerUpUse,
  change: (value: MobilityState) => MobilityState,
  events: ReturnType<typeof grappleHookedOf>[] = [],
): PowerUpOutcome {
  return { kind: 'acted', effect: { state: updateMobility(state, use.playerId, change), events } }
}

function burstWith(
  state: AuthorityState,
  use: PowerUpUse,
  numbers: BurstNumbers,
  directionOf: (pose: VehiclePose) => IntegerVector,
  change: (value: MobilityState, burst: BurstWindow) => MobilityState,
): PowerUpOutcome {
  const vehicle = vehicleOf(state, use.playerId)
  if (vehicle.pose === null) return { kind: 'refused', reason: OUT_OF_PLAY }
  const direction = directionOf(vehicle.pose)
  const burst = {
    dirX: direction.x,
    dirY: direction.y,
    speedMmPerS: shareOfTopSpeedMm(statsOfVehicle(vehicle).engine.speedMax, numbers.speedShareBp),
    untilTick: use.tick + magnitudeOf(use, numbers.burstTicks),
  }
  return actedWith(state, use, (value) => change(value, burst))
}

/** The use's magnitude at its Mark, else the item's number as bought. */
function magnitudeOf(use: PowerUpUse, bought: number): number {
  return use.magnitude ?? bought
}

/** Left or right as the miner faces; up when it faces up or down (#162: "sideways or up"). */
function steeringDirectionOf(pose: VehiclePose): IntegerVector {
  if (pose.facing === FACING.left || pose.facing === FACING.right) {
    return facingVectorOf(pose.upx, pose.upy, pose.facing)
  }
  return upOf(pose)
}

function upOf(pose: VehiclePose): IntegerVector {
  return { x: pose.upx, y: pose.upy }
}

function shareOfTopSpeedMm(speedMaxMetresPerSecond: number, shareBp: number): number {
  return Math.floor((speedMaxMetresPerSecond * MM_PER_METRE * shareBp) / BASIS_POINTS)
}

/**
 * Hauled at the engine's top speed (the kernel's reel), the winch holds the miner at the hook for
 * a moment, and lets go after `reelTicksMax` whatever happens.
 */
function reelOf(state: AuthorityState, use: PowerUpUse, hook: GrappleHook) {
  const { reelHoldTicks, reelTicksMax } = NUMBERS.grapple
  const speedMax = statsOfVehicle(vehicleOf(state, use.playerId)).engine.speedMax
  const travelTicks = Math.ceil((hook.distanceMm * TICKS_PER_SECOND) / (speedMax * MM_PER_METRE))
  return {
    hookTx: hook.hook.tx,
    hookTy: hook.hook.ty,
    tx: hook.to.tx,
    ty: hook.to.ty,
    untilTick: use.tick + Math.min(reelTicksMax, travelTicks + reelHoldTicks),
  }
}
