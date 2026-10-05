/**
 * How the bot moves and bores (#29): as a client would, through `reportPose` at most every 12
 * ticks (5 per second, #11 amendments) with the action ticks since the last report, so energy is
 * charged by the authority exactly as in play. Boring is a report facing the tile with the drill
 * ticks it took; moving is a run of reports along a straight tunnel. Positions are tile centres,
 * upright (up = (0, 1024)), velocity 0 at each report.
 */
import { POSE_REPORT_INTERVAL_TICKS } from '../../constants/balance'
import { isVehicleActive, statsOfVehicle } from '../vehicle/vehicleState'
import type { Facing } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { faceThreats } from './botCombat'
import { facingTowards, NO_TICKS, reportPoseIntent } from './botPose'
import type { BotSession } from './botSession'
import { moveTicks } from './botWorld'
import type { MineLayout } from './mineLayout'

/** A bore reports at least this often, like the client's 5 Hz pose reports. */
const BORE_REPORT_TICKS = 60

/** Where the bot's vehicle is; the authority only knows the last report. */
export interface BotPilot {
  position: TilePoint
  facing: Facing
}

/** The bot on one planet: its mine and where its vehicle is. */
export interface BotPlanet {
  layout: MineLayout
  pilot: BotPilot
}

/**
 * Bores the neighbouring tile for `ticks`, reporting facing it every few ticks; between reports the
 * bot turns to meet any enemy closing in (`faceThreats`), so a long core bore is not a free hit.
 */
export function boreTile(session: BotSession, pilot: BotPilot, tile: TilePoint, ticks: number) {
  const facing = facingTowards(pilot.position, tile)
  for (let left = ticks; left > 0 && isVehicleActive(session.vehicle());) {
    faceThreats(session, pilot)
    const chunk = Math.min(left, BORE_REPORT_TICKS)
    session.wait(chunk)
    session.submit(reportPoseIntent(pilot.position, facing, { ...NO_TICKS, drillTicks: chunk }))
    pilot.facing = facing
    left -= chunk
  }
}

/**
 * Moves into a tile the drill just opened: the bore's speed already covers the advance (#6), and
 * the next report (the next bore or move) carries the new position.
 */
export function enterBoredTile(pilot: BotPilot, tile: TilePoint): void {
  pilot.position = tile
}

/**
 * Moves in a straight line through open tiles to `to`, reporting along the way. Climbing is
 * thrust; driving and falling are drive (#6 energy rates).
 */
export function moveStraight(session: BotSession, pilot: BotPilot, to: TilePoint): void {
  const tiles = straightPath(pilot.position, to)
  const speed = statsOfVehicle(session.vehicle()).engine.speedMax
  const isClimb = to.ty > pilot.position.ty
  let reportedTicks = 0
  tiles.forEach((tile, index) => {
    const ticks = moveTicks(index + 1, speed)
    const isLast = index === tiles.length - 1
    if (!isLast && ticks - reportedTicks < POSE_REPORT_INTERVAL_TICKS) return
    reportMove(session, tile, facingTowards(pilot.position, to), ticks - reportedTicks, isClimb)
    reportedTicks = ticks
  })
  if (tiles.length > 0) pilot.facing = facingTowards(pilot.position, to)
  pilot.position = to
}

function reportMove(
  session: BotSession,
  tile: TilePoint,
  facing: Facing,
  ticks: number,
  isClimb: boolean,
): void {
  session.wait(ticks)
  const counts = isClimb ? { ...NO_TICKS, thrustTicks: ticks } : { ...NO_TICKS, driveTicks: ticks }
  session.submit(reportPoseIntent(tile, facing, counts))
}

/** The tiles after `from` up to and including `to`, along one axis. */
function straightPath(from: TilePoint, to: TilePoint): TilePoint[] {
  const dx = Math.sign(to.tx - from.tx)
  const dy = Math.sign(to.ty - from.ty)
  const length = Math.abs(to.tx - from.tx) + Math.abs(to.ty - from.ty)
  if (dx !== 0 && dy !== 0) throw new RangeError('the bot moves along one axis at a time')
  return Array.from({ length }, (_, step) => ({
    tx: from.tx + dx * (step + 1),
    ty: from.ty + dy * (step + 1),
  }))
}
