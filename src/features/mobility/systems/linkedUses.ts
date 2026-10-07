/**
 * A mobility item fired by another's sibling-link (ticket 275, the GD lock on #256):
 * `power-up-core` hands it its magnitude at half strength, from its own slot and charge. The
 * grapple (half range), the steam boost (half burn) and the steam shield (half curtain) act on
 * that magnitude like a plain use. The ballast and the smoke canister are stronger by something
 * else, so they act for their own window at their Mark and halve that instead: the ballast's lift
 * gain and the smoke's reach (the lock's worked examples). The rivet patch plates its half share.
 *
 * A linked use that would add nothing to the same effect already running (a drop, a curtain or a
 * cloud) finds nothing to act on: the link does not fire and spends nothing (ticket 274).
 */
import { BASIS_POINTS } from '../../../constants/balance'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { powerUpAtMarkOf, type PowerUpUse } from '../../power-up-core'
import { MOBILITY_ECONOMY } from './mobilityEconomy'
import { ballastGainBp } from './mobilityMotion'
import { mobilityOf } from './mobilitySection'
import {
  actedWith,
  OUT_OF_PLAY,
  raiseSteamShield,
  startRivetHold,
  type Activate,
} from './mobilityUses'

/** Why a linked use found its effect already running (`power_up_refused.reason`). */
export const BALLAST_DROPPED = 'mobility.ballast_dropped'
export const SHIELD_STANDING = 'mobility.shield_standing'
export const CLOUD_STANDING = 'mobility.cloud_standing'

const N = MOBILITY_ECONOMY

/** Lighter at half the ballast's lift gain, for its own window at its Mark. */
export const dropLinkedBallast: Activate = (state, use) => {
  if (use.tick < mobilityOf(state, use.playerId).ballastUntilTick) {
    return { kind: 'refused', reason: BALLAST_DROPPED }
  }
  const ballastUntilTick = use.tick + ownMagnitudeOf(state, use, N.ballast.windowTicks)
  const gainBp = linkedShareOf(ballastGainBp())
  return actedWith(state, use, (value) => ({ ...value, ballastUntilTick, ballastGainBp: gainBp }))
}

/** A half curtain, raised only when none stands. */
export const raiseLinkedShield: Activate = (state, use) => {
  if (use.tick < mobilityOf(state, use.playerId).shieldUntilTick) {
    return { kind: 'refused', reason: SHIELD_STANDING }
  }
  return raiseSteamShield(state, use)
}

/** A small puff where the miner is, at half the canister's reach, for its own window. */
export const puffLinkedSmoke: Activate = (state, use) => {
  const standing = mobilityOf(state, use.playerId).smoke
  if (standing !== null && use.tick < standing.untilTick) {
    return { kind: 'refused', reason: CLOUD_STANDING }
  }
  const pose = vehicleOf(state, use.playerId).pose
  if (pose === null) return { kind: 'refused', reason: OUT_OF_PLAY }
  const smoke = {
    x: pose.x,
    y: pose.y,
    untilTick: use.tick + ownMagnitudeOf(state, use, N.smoke.windowTicks),
    radiusTiles: linkedShareOf(N.smoke.radiusTiles),
  }
  return actedWith(state, use, (value) => ({ ...value, smoke }))
}

/** A hold that plates the half share the link handed over. */
export const startLinkedPatch: Activate = (state, use) =>
  startRivetHold(state, use, {
    plateShareBp: use.magnitude ?? linkedShareOf(N.rivetPatch.hullShareBp),
  })

/** The item's magnitude at its Mark, not the link's half of it. */
function ownMagnitudeOf(state: AuthorityState, use: PowerUpUse, bought: number): number {
  return powerUpAtMarkOf(state, use.playerId, use.itemId)?.magnitude ?? bought
}

/** Rounded down to whole units, as every ladder magnitude is. */
function linkedShareOf(full: number): number {
  return Math.floor((full * N.milestones.linkedStrengthBp) / BASIS_POINTS)
}
