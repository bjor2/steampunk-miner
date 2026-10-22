/**
 * How the bot moves and bores (#29): as a client would, through `reportPose` at most every 12
 * ticks (5 per second, #11 amendments) with the action ticks since the last report, so energy is
 * charged by the authority exactly as in play. Moving is a run of reports along a straight tunnel.
 * Boring is a report facing the tile, then scripted mining of that one tile (`drillTile`, #3, #11
 * section 5) for the drill time it took, on the scripted sub-step clock since ticket 559
 * (`boreClock.ts`): a tile's own sub-steps, the part of a tick it left over spent by the next bore,
 * so a fast rig bores past 60 cells/s. The #6 movement-time model the pacing gate measures bores one
 * 1 m tile at a time, where the player's drill stamp (#36, #661) opens more ground per metre.
 * Scripted mining lays and charges casing through the player's placement code (#115), one ring per
 * metre the bot bores, charged per metre as a player's two rings are, onto the lining bill its
 * sales settle. Positions are tile centres, upright (up = (0, 1024)), velocity 0 at each report.
 */
import { POSE_REPORT_INTERVAL_TICKS } from '../../constants/balance'
import { isVehicleActive } from '../vehicle/vehicleState'
import type { Facing } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import { waitFiring, type BorePolicy } from './botBore'
import {
  borePlanOf,
  carriedSubStepsOf,
  type BoreCarry,
  type BoreChunk,
  type TileBore,
} from './boreClock'
import { faceThreats } from './botCombat'
import type { ChargePolicy } from './botCharges'
import type { RouteDeaths } from './botDeathReplay'
import { setGunsForEnergy } from './botGuns'
import { facingTowards, NO_TICKS, reportPoseIntent } from './botPose'
import type { BotSession } from './botSession'
import type { GateRouteBlock } from './gateRouteBlocks'
import type { DownBoreTally, DownLeg } from './downBores'
import type { SidewaysBoreTally } from './sidewaysBores'
import { botTravelSpeedOf, moveTicks, tileKindAt } from './botWorld'
import type { MineLayout } from './mineLayout'

/** A bore reports at least this often, like the client's 5 Hz pose reports. */
const BORE_REPORT_TICKS = 60

/** Where the bot's vehicle is; the authority only knows the last report. */
export interface BotPilot {
  position: TilePoint
  facing: Facing
  /** Whether it fires the bore gun while it bores or stands by (ticket 347); absent is `never`. */
  borePolicy?: BorePolicy
  /** The ticks each enemy has held it facing (`faceThreats`, ticket 418); absent is none yet. */
  heldTicksByEnemy?: Map<string, number>
  /** What its last bore left of the tick it ended on (ticket 559); absent is none. */
  boreCarry?: BoreCarry
  /** The speed down its last bore left (#724, `downBores.ts`); absent is none. */
  downLeg?: DownLeg
}

/** The bot on one planet: its mine, where its vehicle is, and whether it blasts (#109). */
export interface BotPlanet {
  layout: MineLayout
  pilot: BotPilot
  chargePolicy: ChargePolicy
  /** It met a tile here it would blast with no charge in stock, so it wants charges (#129). */
  hasMetBlastTile: boolean
  /** The largest charge size a dynamite-gated shell met here needs and the rack lacked, else 0. */
  shellChargeSize: number
  /**
   * Its vehicle was destroyed here, so it meets enemies while it drives too (#130): with the
   * reflex only between bores, a fatal dive replayed after every tow. Travel starts afresh.
   */
  hasBeenDestroyedHere: boolean
  /** Deaths per route here, and the routes it retreated from (#198, `botDeathReplay.ts`). */
  routeDeaths: RouteDeaths
  /**
   * The run's gated walls that stopped its way down with no means to open them (ticket 237,
   * `gateRouteBlocks.ts`): one record for the whole run, carried from planet to planet.
   */
  gateRouteBlocks: GateRouteBlock[]
  /**
   * The run's sideways bores per planet (ticket 723, `sidewaysBores.ts`), carried the same way;
   * absent in a spec's hand-built planet, which tallies none.
   */
  sidewaysBores?: SidewaysBoreTally
  /** The run's bores down per planet (#724, `downBores.ts`), carried the same way. */
  downBores?: DownBoreTally
}

/**
 * Bores the neighbouring tile for its drill time on the scripted clock, reporting facing it every
 * few ticks; between reports the bot turns to meet any enemy closing in (`faceThreats`), so a long
 * core bore is not a free hit, and sets its guns for the tank it has (`setGunsForEnergy`). A forced
 * pilot fires the bore gun at its cadence through the wait (`waitFiring`). What it leaves of its
 * last tick is carried to a bore that starts at that tick (ticket 559).
 */
export function boreTile(session: BotSession, pilot: BotPilot, tile: TilePoint, bore: TileBore) {
  const carried = carriedSubStepsOf(pilot.boreCarry, session.tick(), bore.quantum)
  const plan = borePlanOf(bore, carried, BORE_REPORT_TICKS)
  pilot.boreCarry = undefined
  const isBored = plan.chunks.every((chunk) => boreChunk(session, pilot, tile, chunk))
  if (!isBored) return
  pilot.boreCarry = { tick: session.tick(), subSteps: plan.leftSubSteps, quantum: bore.quantum }
}

/** One report's stretch of a bore; false when the tile opened early or the vehicle was lost. */
function boreChunk(session: BotSession, pilot: BotPilot, tile: TilePoint, chunk: BoreChunk) {
  if (!isBoreOn(session, tile)) return false
  const facing = facingTowards(pilot.position, tile)
  faceThreats(session, pilot)
  setGunsForEnergy(session)
  session.submit(reportPoseIntent(pilot.position, facing, NO_TICKS))
  waitFiring(session, pilot, chunk.waitTicks)
  if (!isBoreOn(session, tile)) return false
  session.submit({ type: 'drillTile', payload: { ...tile, ticks: chunk.windowTicks } })
  pilot.facing = facing
  return true
}

/**
 * An enemy can destroy the vehicle while it waits, and the drill then has nothing to drive. The
 * tile can open before the ticks counted for a whole cell are spent: a cell keeps what earlier
 * cuts took off it, and the authority refuses a drill on open ground.
 */
function isBoreOn(session: BotSession, tile: TilePoint): boolean {
  return isVehicleActive(session.vehicle()) && tileKindAt(session.state(), tile) !== 'open'
}

/**
 * Presses the drill on the tile for one tick, so its gate answers the touch: an extractor's verb
 * starts there (ticket 237). A refused cell takes no drill ticks, so the touch costs no energy.
 */
export function touchTile(session: BotSession, pilot: BotPilot, tile: TilePoint): void {
  const facing = facingTowards(pilot.position, tile)
  session.submit(reportPoseIntent(pilot.position, facing, NO_TICKS))
  session.wait(1)
  session.submit({ type: 'drillTile', payload: { ...tile, ticks: 1 } })
  pilot.facing = facing
}

/** Waits where it stands for `ticks`, meeting threats, setting its guns and firing as a bore does. */
export function standBy(session: BotSession, pilot: BotPilot, ticks: number): void {
  for (let left = ticks; left > 0 && isVehicleActive(session.vehicle());) {
    faceThreats(session, pilot)
    setGunsForEnergy(session)
    const chunk = Math.min(left, BORE_REPORT_TICKS)
    waitFiring(session, pilot, chunk)
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
  const speed = botTravelSpeedOf(session.state(), session.playerId)
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
