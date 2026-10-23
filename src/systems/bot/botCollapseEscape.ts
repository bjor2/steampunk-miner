/**
 * The bot's way out from under a warned collapse block while it holds against a threat (ticket
 * 742, GD and TD rulings on #724). Holding still facing an enemy for up to 600 ticks, the bot sat
 * under a block whose warning it never read, and the refill crushed it once a cycle: on planet 7
 * seed 83921 four crushes in one hold, the holder rig then lost to the core cascade. It now reads
 * the warning a player sees and steps out within the 60-tick window, to the nearest open tile the
 * refill cannot catch, holds there, and steps back once the block has settled.
 *
 * Bot logic only: the warning players see is unchanged and the rig has no reflex (Systems on #664
 * and #673). "Caught" is the authority's own test (`planRefill`): the rig's clearance circle
 * reaches the block's carved air, reinforced cells left out, so a block lined to hold never sends
 * it out. A braced block is not read: it never refills while braced, and when the brace ends it
 * warns afresh. The way back reads the bot's tunnels as open, as all its travel does.
 */
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { blockOfEntry, refillTickOf, settledTickOf } from '../authority/collapse/collapseState'
import type { CollapsingBlock } from '../authority/collapse/collapseState'
import { reinforcedCellsOf } from '../authority/collapse/collapseReinforcement'
import type { AuthorityState } from '../authority/authorityState'
import { planRefill } from '../world/collapseRefill'
import type { TilePoint } from '../world/tileGrid'
import { isVehicleActive } from '../vehicle/vehicleState'
import type { BotPilot } from './botPilot'
import { botPoseAt, facingTowards, NO_TICKS, reportPoseIntent } from './botPose'
import type { BotSession } from './botSession'
import { botTravelSpeedOf, moveTicks, paramsOfSession, tileKindAt } from './botWorld'

/** A 4 m block and the clearance circle past its edge: the farthest a way out is looked for. */
const ESCAPE_REACH_TILES = 6
/** Back up the shaft first, where the lining is, then along a row, then down. */
const ESCAPE_FACINGS: readonly Facing[] = [FACING.up, FACING.left, FACING.right, FACING.down]
const STEP_OF_FACING: Readonly<Record<Facing, TilePoint>> = {
  [FACING.left]: { tx: -1, ty: 0 },
  [FACING.right]: { tx: 1, ty: 0 },
  [FACING.down]: { tx: 0, ty: -1 },
  [FACING.up]: { tx: 0, ty: 1 },
}
/** Waits out a settling block a pose-report interval at a time. */
const SETTLE_WAIT_TICKS = 12

interface EscapeRoute {
  to: TilePoint
  tiles: number
}

/** Steps out from under the warnings whose refill would catch the rig where it stands, if it can. */
export function escapeWarnedBlocks(session: BotSession, pilot: BotPilot): void {
  const catching = catchingWarningsAt(session.state(), pilot.position)
  if (catching.length === 0) return
  const route = escapeRouteOf(session, pilot.position, earliestRefillTickOf(catching))
  if (route !== null) moveBotTo(session, pilot, route)
}

/** Back to `home` after an escape, once the blocks that would catch it there have settled. */
export function returnFromEscape(session: BotSession, pilot: BotPilot, home: TilePoint): void {
  if (isSameTile(pilot.position, home)) return
  waitOutSettlingAt(session, home)
  if (!isVehicleActive(session.vehicle())) return
  moveBotTo(session, pilot, { to: home, tiles: tilesBetween(pilot.position, home) })
}

/** The warned blocks still to refill whose refill would crush a rig standing at `tile`. */
export function catchingWarningsAt(state: AuthorityState, tile: TilePoint): CollapsingBlock[] {
  const pending = state.collapse.blocks.filter((entry) => isRefillPending(entry, state.tick))
  if (pending.length === 0) return []
  const centre = bodyCentreAt(tile)
  const isReinforced = reinforcedCellsOf(state)
  const params = paramsOfSession(state)
  return pending.filter(
    (entry) =>
      planRefill(state.world, params, blockOfEntry(entry), [centre], isReinforced).caught[0],
  )
}

function isRefillPending(entry: CollapsingBlock, tick: number): boolean {
  return entry.isBraced !== true && tick < refillTickOf(entry)
}

function earliestRefillTickOf(entries: readonly CollapsingBlock[]): number {
  return Math.min(...entries.map(refillTickOf))
}

/**
 * The nearest open tile in a straight line, in `ESCAPE_FACINGS` order on a tie, that no pending
 * refill catches and that the rig reaches before `refillTick`; null when there is none.
 */
function escapeRouteOf(
  session: BotSession,
  from: TilePoint,
  refillTick: number,
): EscapeRoute | null {
  const ticksLeft = refillTick - session.tick()
  const speed = botTravelSpeedOf(session.state(), session.playerId)
  for (let tiles = 1; tiles <= ESCAPE_REACH_TILES && moveTicks(tiles, speed) < ticksLeft; tiles++) {
    const to = firstSafeTileAt(session.state(), from, tiles)
    if (to !== null) return { to, tiles }
  }
  return null
}

function firstSafeTileAt(state: AuthorityState, from: TilePoint, tiles: number): TilePoint | null {
  for (const facing of ESCAPE_FACINGS) {
    const path = pathOf(from, facing, tiles)
    if (isOpenPath(state, path) && catchingWarningsAt(state, path[tiles - 1]).length === 0) {
      return path[tiles - 1]
    }
  }
  return null
}

function pathOf(from: TilePoint, facing: Facing, tiles: number): TilePoint[] {
  const step = STEP_OF_FACING[facing]
  return Array.from({ length: tiles }, (_, at) => ({
    tx: from.tx + step.tx * (at + 1),
    ty: from.ty + step.ty * (at + 1),
  }))
}

function isOpenPath(state: AuthorityState, path: readonly TilePoint[]): boolean {
  return path.every((tile) => tileKindAt(state, tile) === 'open')
}

/**
 * Waits until every block that would catch the rig at `tile` has refilled and settled: back during
 * the refill, it would stand in what is still filling. Bounded by the last such block's settle.
 */
function waitOutSettlingAt(session: BotSession, tile: TilePoint): void {
  const catching = catchingWarningsAt(session.state(), tile)
  if (catching.length === 0) return
  const settledTick = Math.max(...catching.map(settledTickOf))
  while (session.tick() < settledTick && isVehicleActive(session.vehicle())) {
    session.wait(Math.min(SETTLE_WAIT_TICKS, settledTick - session.tick()))
  }
}

/** One move along a straight line, reported on arrival as `moveStraight`'s last report is. */
function moveBotTo(session: BotSession, pilot: BotPilot, route: EscapeRoute): void {
  const facing = facingTowards(pilot.position, route.to)
  const ticks = moveTicks(route.tiles, botTravelSpeedOf(session.state(), session.playerId))
  const counts =
    facing === FACING.up ? { ...NO_TICKS, thrustTicks: ticks } : { ...NO_TICKS, driveTicks: ticks }
  session.wait(ticks)
  session.submit(reportPoseIntent(route.to, facing, counts))
  pilot.position = route.to
  pilot.facing = facing
}

function bodyCentreAt(tile: TilePoint): { xMm: number; yMm: number } {
  const pose = botPoseAt(tile, FACING.down)
  return { xMm: pose.x, yMm: pose.y }
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}

function tilesBetween(a: TilePoint, b: TilePoint): number {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty)
}
