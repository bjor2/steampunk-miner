/**
 * The pacing bot and the bore gun (ticket 347, the TD's seam 3 on #314, ruled by the GD): by
 * default it never fires. The forced run, `balance:bore`'s comparison against `never`, starts with
 * the gun at its walls (the provider's `wallsMountIntent`) and fires `ground_gun.fire` at every
 * `nextShotTick` while it bores or stands by.
 *
 * Its waits fire at the gun's own cadence: `waitFiring` splits a wait at each `nextShotTick` and
 * fires on that tick, so a 60-tick report chunk never quantises the shots (a floor of 15 ticks
 * would otherwise fire at most once a chunk). It costs a step per shot and per cell a pending shot
 * opens, never one per tick.
 *
 * It aims as auto aim does, at the ore of highest sale value over the arc with holds ignored, the
 * worst case for the 0.98x guard because value shots turn into drill buys fastest; with no ore in
 * reach it fires the 60° edge on the side it faces. A shot the gun would refuse is never sent:
 * the wait then runs out without firing.
 */
import { ARC_EDGE_BEARINGS } from '../authority/bore/boreAim'
import { bestBoreBearingOf } from '../authority/bore/boreAuto'
import { boreShotRefusal, nextShotTickOf } from '../authority/bore/boreFire'
import { boreGunWallsMountIntent } from '../registries/boreGun'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { BotPilot } from './botPilot'
import type { BotSession } from './botSession'

/** Whether the bot fires the bore gun: never (the default), or at every `nextShotTick`. */
export type BorePolicy = 'never' | 'forced'

export const DEFAULT_BORE_POLICY: BorePolicy = 'never'

/** The forced run's start: the gun mounted at its walls, when the provider names how. */
export function mountBoreGunWhenForced(session: BotSession, policy: BorePolicy): void {
  const intent = boreGunWallsMountIntent()
  if (policy === 'forced' && intent !== null) session.submit(intent)
}

/** Waits `ticks`; a forced pilot fires the gun on each `nextShotTick` inside the wait. */
export function waitFiring(session: BotSession, pilot: BotPilot, ticks: number): void {
  if ((pilot.borePolicy ?? DEFAULT_BORE_POLICY) === 'never') return session.wait(ticks)
  fireUntil(session, pilot, session.tick() + ticks)
}

/**
 * Fires at each shot tick before `endTick`, waiting between them, and leaves the clock at
 * `endTick`; a shot the gun would refuse ends the firing and the rest of the wait passes idle.
 */
function fireUntil(session: BotSession, pilot: BotPilot, endTick: number): void {
  while (session.tick() < endTick) {
    const shotTick = nextShotTickOf(session.state(), session.playerId)
    if (shotTick > session.tick()) {
      session.wait(Math.min(shotTick, endTick) - session.tick())
    } else if (!fireBestShot(session, pilot)) {
      break
    }
  }
  session.wait(endTick - session.tick())
}

/** Sends the shot when the gun would take it; false when it would refuse. */
function fireBestShot(session: BotSession, pilot: BotPilot): boolean {
  const bearing = shotBearingOf(session, pilot.facing)
  const ask = { playerId: session.playerId, tick: session.tick(), bearing }
  if (boreShotRefusal(session.state(), ask) !== null) return false
  session.submit({ type: 'ground_gun.fire', payload: { bearing } })
  return true
}

/** The best ore over the arc, else the 60° edge on the side the bot faces. */
function shotBearingOf(session: BotSession, facing: Facing): number {
  return bestBoreBearingOf(session.state(), session.playerId) ?? facingEdgeOf(facing)
}

/** Facing down or up (a shaft), the right edge: the side the rig rests facing. */
function facingEdgeOf(facing: Facing): number {
  return facing === FACING.left ? ARC_EDGE_BEARINGS.left : ARC_EDGE_BEARINGS.right
}
