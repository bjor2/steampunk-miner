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
 *
 * The auto run (ticket 318, the GD's Vertical pin on #310: the forced-gun bot runs with auto-shoot
 * on) starts and fires as the forced one until the steam sear is on its gun, which it researches
 * and buys as any store item; then it switches auto mode on through the same `set_auto` a player
 * sends, only once the toggle would be accepted, and lets the authority fire while it waits.
 */
import { ARC_EDGE_BEARINGS } from '../authority/bore/boreAim'
import { bestBoreBearingOf } from '../authority/bore/boreAuto'
import { boreShotRefusal, nextShotTickOf, STEAM_SEAR_ITEM_ID } from '../authority/bore/boreFire'
import { isAutoModeOn } from '../authority/autoMode/autoModeState'
import { autoToggleRefusal } from '../authority/autoMode/autoToggle'
import { boreAutoShootOf, boreGunWallsMountIntent } from '../registries/boreGun'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { BotPilot } from './botPilot'
import type { BotSession } from './botSession'

/**
 * Whether the bot fires the bore gun: never (the default), at every `nextShotTick`, or so until
 * the sear lets the authority fire on auto.
 */
export type BorePolicy = 'never' | 'forced' | 'auto'

export const DEFAULT_BORE_POLICY: BorePolicy = 'never'

/** The forced and auto runs' start: the gun mounted at its walls, when the provider names how. */
export function mountBoreGunWhenForced(session: BotSession, policy: BorePolicy): void {
  const intent = boreGunWallsMountIntent()
  if (policy !== 'never' && intent !== null) session.submit(intent)
}

/**
 * Waits `ticks`; a forced pilot fires the gun on each `nextShotTick` inside the wait, and an auto
 * pilot whose gun is on auto leaves the firing to the authority.
 */
export function waitFiring(session: BotSession, pilot: BotPilot, ticks: number): void {
  const policy = pilot.borePolicy ?? DEFAULT_BORE_POLICY
  if (policy === 'auto') switchAutoOnWhenReady(session)
  if (policy === 'never' || isOnAuto(session)) return session.wait(ticks)
  fireUntil(session, pilot, session.tick() + ticks)
}

/** Sends `set_auto {on}` once the sear is on the gun and the toggle would be accepted. */
function switchAutoOnWhenReady(session: BotSession): void {
  if (isOnAuto(session) || !isSearOnGun(session)) return
  session.submit({ type: 'ground_gun.set_auto', payload: { on: true } })
}

function isOnAuto(session: BotSession): boolean {
  return isAutoModeOn(session.state(), session.playerId, STEAM_SEAR_ITEM_ID)
}

/** Researched, so `set_auto` is accepted, and on the gun, so the mode has numbers to fire with. */
function isSearOnGun(session: BotSession): boolean {
  const state = session.state()
  if (autoToggleRefusal(state, session.playerId, STEAM_SEAR_ITEM_ID) !== null) return false
  return boreAutoShootOf(state, session.playerId) !== null
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
