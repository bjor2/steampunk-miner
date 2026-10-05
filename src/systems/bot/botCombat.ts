/**
 * The bot's one combat reflex (#9 drill-contact rule, #29 Gameplay note 3): a hunting enemy within
 * reach is met with the drill head. The bot turns to face it and holds, so the enemy pins itself on
 * the drill and takes the heavy front damage, instead of hitting a side or the rear while the bot
 * looks the other way. Facing is one of the four drill directions, along the larger offset.
 */
import type { Enemy } from '../authority/combat/combatState'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { isVehicleActive } from '../vehicle/vehicleState'
import type { BotPilot } from './botPilot'
import { reportPoseIntent } from './botPose'
import type { BotSession } from './botSession'

/** Enemies this close (centre to centre, each axis) are faced; the contact reach is 1100 mm. */
const THREAT_RANGE_MM = 3500
/** Holds the facing for one pose-report interval at a time. */
const HOLD_TICKS = 12
/** Gives up after this long, so a stuck enemy cannot hold the trip forever. */
const HOLD_LIMIT_TICKS = 600

export function faceThreats(session: BotSession, pilot: BotPilot): void {
  for (let held = 0; held < HOLD_LIMIT_TICKS; held += HOLD_TICKS) {
    const threat = nearestThreat(session, pilot)
    if (threat === null || !isVehicleActive(session.vehicle())) return
    pilot.facing = facingTowardsEnemy(pilot, threat)
    session.submit(reportPoseIntent(pilot.position, pilot.facing))
    session.wait(HOLD_TICKS)
  }
}

function nearestThreat(session: BotSession, pilot: BotPilot): Enemy | null {
  const threats = session
    .state()
    .combat.enemies.filter((enemy) => enemy.ownerId === session.playerId && enemy.phase !== 'idle')
    .filter((enemy) => isWithinRange(pilot, enemy))
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
