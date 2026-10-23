/**
 * The bot's one combat reflex (#9 drill-contact rule, #29 Gameplay note 3): a hunting enemy within
 * reach is met with the drill head. The bot turns to face it and holds, so the enemy pins itself on
 * the drill and takes the heavy front damage, instead of hitting a side or the rear while the bot
 * looks the other way. Facing is one of the four drill directions, along the larger offset.
 *
 * Each enemy holds the bot for `HOLD_LIMIT_TICKS` in all (ticket 418): a crawler hunting from a
 * cave behind solid rock never reaches the drill, and with the limit counted per call it held the
 * bot 10 s on every tile cut beside it, 10 of planet 1's 34 minutes.
 *
 * A hold never stands under a warned block whose refill would catch the rig (ticket 742): the bot
 * steps out within the warning, holds from there, and steps back once the block has settled
 * (`botCollapseEscape.ts`).
 */
import type { Enemy } from '../authority/combat/combatState'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { isVehicleActive } from '../vehicle/vehicleState'
import { escapeWarnedBlocks, returnFromEscape } from './botCollapseEscape'
import type { BotPilot } from './botPilot'
import { reportPoseIntent } from './botPose'
import type { BotSession } from './botSession'

/** Enemies this close (centre to centre, each axis) are faced; the contact reach is 1100 mm. */
const THREAT_RANGE_MM = 3500
/** Holds the facing for one pose-report interval at a time. */
const HOLD_TICKS = 12
/** Gives up on an enemy after this long, so a stuck enemy cannot hold the trip forever. */
const HOLD_LIMIT_TICKS = 600

export function faceThreats(session: BotSession, pilot: BotPilot): void {
  const home = pilot.position
  holdAgainstThreats(session, pilot)
  returnFromEscape(session, pilot, home)
}

function holdAgainstThreats(session: BotSession, pilot: BotPilot): void {
  for (let held = 0; held < HOLD_LIMIT_TICKS; held += HOLD_TICKS) {
    const threat = nearestThreat(session, pilot)
    if (threat === null || !isVehicleActive(session.vehicle())) return
    escapeWarnedBlocks(session, pilot)
    holdFacing(session, pilot, threat)
  }
}

function holdFacing(session: BotSession, pilot: BotPilot, threat: Enemy): void {
  pilot.facing = facingTowardsEnemy(pilot, threat)
  session.submit(reportPoseIntent(pilot.position, pilot.facing))
  session.wait(HOLD_TICKS)
  countHeldTicks(pilot, threat)
}

function countHeldTicks(pilot: BotPilot, enemy: Enemy): void {
  pilot.heldTicksByEnemy ??= new Map()
  pilot.heldTicksByEnemy.set(enemy.id, heldTicksOf(pilot, enemy) + HOLD_TICKS)
}

function heldTicksOf(pilot: BotPilot, enemy: Enemy): number {
  return pilot.heldTicksByEnemy?.get(enemy.id) ?? 0
}

function hasHoldLeft(pilot: BotPilot, enemy: Enemy): boolean {
  return heldTicksOf(pilot, enemy) < HOLD_LIMIT_TICKS
}

function nearestThreat(session: BotSession, pilot: BotPilot): Enemy | null {
  const threats = session
    .state()
    .combat.enemies.filter((enemy) => enemy.ownerId === session.playerId && enemy.phase !== 'idle')
    .filter((enemy) => isWithinRange(pilot, enemy) && hasHoldLeft(pilot, enemy))
  return threats.reduce<Enemy | null>(
    (nearest, enemy) =>
      nearest === null || distanceOf(pilot, enemy) < distanceOf(pilot, nearest) ? enemy : nearest,
    null,
  )
}

function isWithinRange(pilot: BotPilot, enemy: Enemy): boolean {
  const { dx, dy } = offsetOf(pilot, enemy)
  return Math.abs(dx) <= THREAT_RANGE_MM && Math.abs(dy) <= THREAT_RANGE_MM
}

function distanceOf(pilot: BotPilot, enemy: Enemy): number {
  const { dx, dy } = offsetOf(pilot, enemy)
  return Math.abs(dx) + Math.abs(dy)
}

function offsetOf(pilot: BotPilot, enemy: Enemy): { dx: number; dy: number } {
  return {
    dx: enemy.x - (pilot.position.tx * 1000 + 500),
    dy: enemy.y - (pilot.position.ty * 1000 + 500),
  }
}

function facingTowardsEnemy(pilot: BotPilot, enemy: Enemy): Facing {
  const { dx, dy } = offsetOf(pilot, enemy)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? FACING.right : FACING.left
  return dy >= 0 ? FACING.up : FACING.down
}
