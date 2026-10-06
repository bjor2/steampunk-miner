/**
 * How the bot moves and bores (#29): as a client would, through `reportPose` at most every 12
 * ticks (5 per second, #11 amendments) with the action ticks since the last report, so energy is
 * charged by the authority exactly as in play. Moving is a run of reports along a straight tunnel.
 * Boring is a report facing the tile, then scripted mining of that one tile (`drillTile`, #3, #11
 * section 5) for the drill ticks it took: the #6 movement-time model the pacing gate measures bores one
 * 1 m tile at a time, where the player's 1.9 m drill stamp (#36, #41) opens more ground per metre.
 * Scripted mining lays and charges casing through the player's placement code (#115), one ring per
 * metre the bot bores, charged per metre as a player's two rings are, onto the lining bill its
 * sales settle. Positions are tile centres, upright (up = (0, 1024)), velocity 0 at each report.
 */
import { POSE_REPORT_INTERVAL_TICKS } from '../../constants/balance'
import { isVehicleActive, statsOfVehicle } from '../vehicle/vehicleState'
import type { Facing } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { faceThreats } from './botCombat'
import type { ChargePolicy } from './botCharges'
import { setGunsForEnergy } from './botGuns'
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

/** The bot on one planet: its mine, where its vehicle is, and whether it blasts (#109). */
export interface BotPlanet {
  layout: MineLayout
  pilot: BotPilot
  chargePolicy: ChargePolicy
  /** It met a tile here it would blast with no charge in stock, so it wants charges (#129). */
  hasMetBlastTile: boolean
  /**
   * Its vehicle was destroyed here, so it meets enemies while it drives too (#130): with the
   * reflex only between bores, a fatal dive replayed after every tow. Travel starts afresh.
   */
  hasBeenDestroyedHere: boolean
}

/**
 * Bores the neighbouring tile for `ticks`, reporting facing it every few ticks; between reports the
 * bot turns to meet any enemy closing in (`faceThreats`), so a long core bore is not a free hit,
 * and sets its guns for the tank it has (`setGunsForEnergy`).
 */
export function boreTile(session: BotSession, pilot: BotPilot, tile: TilePoint, ticks: number) {
  const facing = facingTowards(pilot.position, tile)
  for (let left = ticks; left > 0 && isVehicleActive(session.vehicle());) {
    faceThreats(session, pilot)
    setGunsForEnergy(session)
    const chunk = Math.min(left, BORE_REPORT_TICKS)
    session.submit(reportPoseIntent(pilot.position, facing, NO_TICKS))
    session.wait(chunk)
    // An enemy can destroy the vehicle while it waits; the drill then has nothing to drive.
    if (!isVehicleActive(session.vehicle())) return
    session.submit({ type: 'drillTile', payload: { ...tile, ticks: chunk } })
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
export function moveStraight(session: BotSession, planet: BotPlanet, to: TilePoint): void {
  const { pilot } = planet
  const tiles = straightPath(pilot.position, to)
  const speed = statsOfVehicle(session.vehicle()).engine.speedMax
  const facing = facingTowards(pilot.position, to)
  const isClimb = to.ty > pilot.position.ty
  let reportedTicks = 0
  tiles.forEach((tile, index) => {
    const ticks = moveTicks(index + 1, speed)
    const isLast = index === tiles.length - 1
    if (!isLast && ticks - reportedTicks < POSE_REPORT_INTERVAL_TICKS) return
    reportMove(session, tile, facing, ticks - reportedTicks, isClimb)
    reportedTicks = ticks
    faceThreatsOnTheMove(session, planet, tile)
  })
  if (tiles.length > 0) pilot.facing = facing
  pilot.position = to
}

/** After a death on this planet, each report on the move also meets a closing enemy (#130). */
function faceThreatsOnTheMove(session: BotSession, planet: BotPlanet, tile: TilePoint): void {
  if (!planet.hasBeenDestroyedHere) return
  planet.pilot.position = tile
  faceThreats(session, planet.pilot)
}

function reportMove(
  session: BotSession,
  tile: TilePoint,
  facing: Facing,
  ticks: number,
  isClimb: boolean,
): void {
  session.wait(ticks)
  setGunsForEnergy(session)
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
