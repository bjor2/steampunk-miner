/**
 * What a second tap or a hold of each mobility item does once its Mark has reached it (ticket 275,
 * the GD lock on #256: charged items and consumables tap at Mark 3 and hold at Mark 6, the toggles
 * the other way round, the rivet patch taps at Mark 3). `power-up-core` spends the item's normal
 * charge or draw for each, so a hold is two actions and two charges; the verb changes only where or
 * how the item acts.
 *
 * None changes a cell, so none meets a gate or `canMine`, and every push goes through
 * `vehicleMotionEffects`, where the kernel holds it under the +2000 bp cap and top speed (#233).
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import {
  facingVectorOf,
  FACING,
  type IntegerVector,
  type VehiclePose,
} from '../../../systems/vehicle/vehiclePose'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { withMove } from './milestoneMoves'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { mobilityOf, unsettledHeatSinksOf, type MobilityState } from './mobilitySection'
import {
  actedWith,
  blowSteamBoost,
  burstWith,
  fireEscapeThruster,
  fireGrappleShot,
  magnitudeOf,
  OUT_OF_PLAY,
  shareOfTopSpeedMm,
  smokeAt,
  startRivetPatch,
  upOf,
  withBallastDropped,
  withHeatSinkFrom,
  type Activate,
} from './mobilityUses'

const N = MOBILITY_ECONOMY
const M = MOBILITY_ECONOMY.milestones

/** Grapple, second tap: fires again at the next anchor, farther off than the hook it holds. */
export const fireGrappleAtNextAnchor: Activate = (state, use) => {
  const reel = mobilityOf(state, use.playerId).reel
  const pastTile = reel === null ? null : { tx: reel.hookTx, ty: reel.hookTy }
  return fireGrappleShot(state, use, { pastTile })
}

/** Grapple, hold: fires again and the winch reels faster. */
export const fireGrappleReelingFast: Activate = (state, use) =>
  fireGrappleShot(state, use, { pastTile: null, reelDriveBp: M.fastReelDriveBp })

/** Ballast, second tap: the drop kicks the miner up a short hop. */
export const hopOnBallast: Activate = (state, use) =>
  kickedWith(state, use, upOf, (value) => withBallastDropped(value, use))

/** Ballast, hold: the miner stays light for longer; the running drop's window runs on. */
export const keepBallastLonger: Activate = (state, use) =>
  actedWith(state, use, (value) => ({
    ...value,
    ballastUntilTick: longerUntil(value.ballastUntilTick, use, N.ballast.windowTicks),
  }))

/** Heat sink flask, second tap: the vent jets out the way the miner faces and shoves it. */
export const jetHeatSink: Activate = (state, use) => {
  const settledTick = vehicleOf(state, use.playerId).heat.settledTick
  const fromTick = Math.max(use.tick, settledTick)
  return kickedWith(state, use, facingOf, (value) =>
    withHeatSinkFrom(value, use, fromTick, settledTick),
  )
}

/** Heat sink flask, hold: a longer pause; the second flask vents and pauses once the first ends. */
export const chainHeatSink: Activate = (state, use) => {
  const settledTick = vehicleOf(state, use.playerId).heat.settledTick
  return actedWith(state, use, (value) => {
    const fromTick = Math.max(use.tick, settledTick, lastPauseEndOf(value))
    return withHeatSinkFrom(value, use, fromTick, settledTick)
  })
}

/** Steam boost, second tap: a sideways air-dash, to the side the miner faces (its right if up or down). */
export const airDashSteamBoost: Activate = (state, use) =>
  burstWith(state, use, N.steamBoost, sidewaysOf, (value, boost) => ({ ...value, boost }))

/** Steam boost, hold: a longer burn; the running boost burns on the same way. */
export const burnSteamBoostLonger: Activate = (state, use) => {
  const boost = mobilityOf(state, use.playerId).boost
  if (boost === null) return blowSteamBoost(state, use)
  const untilTick = longerUntil(boost.untilTick, use, N.steamBoost.burstTicks)
  return actedWith(state, use, (value) => ({ ...value, boost: { ...boost, untilTick } }))
}

/** Escape thruster, second tap: aimed the way the miner faces; it stops at the first solid cell that way. */
export const aimEscapeThruster: Activate = (state, use) =>
  burstWith(state, use, N.escapeThruster, facingOf, (value, escape, pose) => ({
    ...value,
    escape: { ...escape, facing: pose.facing },
  }))

/** Escape thruster, hold: a longer burn; the running climb burns on. */
export const burnEscapeLonger: Activate = (state, use) => {
  const escape = mobilityOf(state, use.playerId).escape
  if (escape === null) return fireEscapeThruster(state, use)
  const untilTick = longerUntil(escape.untilTick, use, N.escapeThruster.burstTicks)
  return actedWith(state, use, (value) => ({ ...value, escape: { ...escape, untilTick } }))
}

/** Rivet patch, second tap: a second plate rides the hold already running, landing with it. */
export const addPlateToPatch: Activate = (state, use) => {
  const patch = mobilityOf(state, use.playerId).patch
  if (patch === null) return startRivetPatch(state, use)
  const plates = (patch.plates ?? 1) + 1
  return actedWith(state, use, (value) => ({ ...value, patch: { ...patch, plates } }))
}

/** Steam shield, second tap: a cooling curtain; heat climbs at half rate while it stands. */
export const raiseCoolingCurtain: Activate = (state, use) => {
  const settledTick = vehicleOf(state, use.playerId).heat.settledTick
  return actedWith(state, use, (value) => {
    const shieldUntilTick = Math.max(
      value.shieldUntilTick,
      use.tick + magnitudeOf(use, N.steamShield.windowTicks),
    )
    const cooling = {
      fromTick: Math.max(use.tick, settledTick),
      untilTick: shieldUntilTick,
      ventBp: 0,
      gainBp: M.coolingGainBp,
    }
    const heatSinks = [...unsettledHeatSinksOf(value, settledTick), cooling]
    return { ...value, shieldUntilTick, heatSinks }
  })
}

/** Steam shield, hold: the curtain stands longer. */
export const keepShieldLonger: Activate = (state, use) =>
  actedWith(state, use, (value) => ({
    ...value,
    shieldUntilTick: longerUntil(value.shieldUntilTick, use, N.steamShield.windowTicks),
  }))

/** Smoke canister, second tap: thrown ahead; the cloud bursts its own radius the way the miner faces. */
export const throwSmokeAhead: Activate = (state, use) =>
  smokeAt(state, use, (pose) => pointAheadOf(pose, N.smoke.radiusTiles))

/** Smoke canister, hold: the cloud lingers longer. */
export const keepSmokeLonger: Activate = (state, use) => {
  const smoke = mobilityOf(state, use.playerId).smoke
  if (smoke === null) return smokeAt(state, use, (pose) => ({ x: pose.x, y: pose.y }))
  const untilTick = longerUntil(smoke.untilTick, use, N.smoke.windowTicks)
  return actedWith(state, use, (value) => ({ ...value, smoke: { ...smoke, untilTick } }))
}

/** Grav anchor, hold: a hard pin; the miner holds even in open air for a second. */
export const pinWithAnchor: Activate = (state, use) =>
  actedWith(state, use, (value) => withMove(value, { untilTick: spellEndOf(use), hover: true }))

/** Grav anchor, second tap: kicks off, shoving the miner away from the face it grips. */
export const kickOffAnchor: Activate = (state, use) =>
  kickedWith(state, use, backOf, (value) => value)

/** Buoyancy tanks, hold: a fast rise; the bladders lift harder for a second. */
export const riseOnTanks: Activate = (state, use) =>
  actedWith(state, use, (value) =>
    withMove(value, { untilTick: spellEndOf(use), liftBp: M.spellBoostBp }),
  )

/** Buoyancy tanks, second tap: a quick drift; the miner drives faster for a second. */
export const driftOnTanks: Activate = (state, use) =>
  actedWith(state, use, (value) =>
    withMove(value, { untilTick: spellEndOf(use), driveBp: M.spellBoostBp }),
  )

/** `change` with a kick along `directionOf` the miner's pose added; refused out of play. */
function kickedWith(
  state: AuthorityState,
  use: PowerUpUse,
  directionOf: (pose: VehiclePose) => IntegerVector,
  change: (value: MobilityState) => MobilityState,
): PowerUpOutcome {
  const vehicle = vehicleOf(state, use.playerId)
  if (vehicle.pose === null) return { kind: 'refused', reason: OUT_OF_PLAY }
  const direction = directionOf(vehicle.pose)
  const speedMmPerS = shareOfTopSpeedMm(statsOfVehicle(vehicle).engine.speedMax, M.kickSpeedShareBp)
  const kick = {
    untilTick: use.tick + M.kickTicks,
    burst: { dirX: direction.x, dirY: direction.y, speedMmPerS },
  }
  return actedWith(state, use, (value) => withMove(change(value), kick))
}

/** A window that runs on by the use's magnitude past its end, or from now once it has ended. */
function longerUntil(untilTick: number, use: PowerUpUse, bought: number): number {
  return Math.max(untilTick, use.tick) + magnitudeOf(use, bought)
}

function lastPauseEndOf(value: MobilityState): number {
  return Math.max(0, ...value.heatSinks.map((window) => window.untilTick))
}

function spellEndOf(use: PowerUpUse): number {
  return use.tick + M.spellTicks
}

function facingOf(pose: VehiclePose): IntegerVector {
  return facingVectorOf(pose.upx, pose.upy, pose.facing)
}

function backOf(pose: VehiclePose): IntegerVector {
  const facing = facingOf(pose)
  return { x: -facing.x, y: -facing.y }
}

/** The side the miner faces, or its right when it faces up or down. */
function sidewaysOf(pose: VehiclePose): IntegerVector {
  const side = pose.facing === FACING.left ? FACING.left : FACING.right
  return facingVectorOf(pose.upx, pose.upy, side)
}

/** The point `tiles` whole tiles from the miner's centre along its facing, in millimetres. */
function pointAheadOf(pose: VehiclePose, tiles: number): { x: number; y: number } {
  const facing = facingOf(pose)
  return {
    x: pose.x + Math.floor((facing.x * tiles * MM_PER_METRE) / UP_VECTOR_SCALE),
    y: pose.y + Math.floor((facing.y * tiles * MM_PER_METRE) / UP_VECTOR_SCALE),
  }
}
