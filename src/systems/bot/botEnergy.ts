/**
 * The bot's energy budget on a trip (#29, #33 section 5): every bore and every move must leave the
 * straight way home in the tank, with a fifth again and one unit to spare, so the bot turns back
 * in time and never strands itself; combat can still cost it the vehicle. A zigzag gallery's way
 * back to the shaft (ticket 899, `galleryWays.ts`) is √2 m a tile, its climbing legs on thrust and
 * drive at once, and is counted so.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { returnReserveUnits } from '../vehicle/returnReserve'
import { statsOfVehicle } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { boreQuanta, botTravelSpeedOf, moveQuanta, moveTicks } from './botWorld'
import { galleryWayOf, type GalleryWay } from './galleryWays'
import { shaftColumnAt, shaftJogLengthAbove, type MineLayout } from './mineLayout'
import { nextRow, type TripGoal } from './tripGoal'

/** The return trip must fit in the tank this many times over, plus one unit. */
const RETURN_MARGIN_NUMERATOR = 6
const RETURN_MARGIN_DENOMINATOR = 5
const RETURN_SPARE_QUANTA = ENERGY_QUANTA_PER_UNIT

/**
 * #29 Gameplay note 3: the bot never leaves the pad with less energy than the #33 return reserve
 * of the gallery it is heading for. Its plans only pick galleries the tank reaches, so this is an
 * invariant, and breaking it is a bug in the bot, not a choice.
 */
export function assertReturnReserve(session: BotSession, planet: BotPlanet, goal: TripGoal): void {
  const row = nextRow(planet.layout, goal)
  const depth = row === null ? 0 : Math.max(0, planet.layout.travelRow - row)
  const vehicle = session.vehicle()
  const reserve = returnReserveUnits(depth, statsOfVehicle(vehicle).engine.speedMax)
  if (vehicle.energy < reserve * ENERGY_QUANTA_PER_UNIT) {
    throw new Error(`the bot would leave the pad below the return reserve of ${reserve} units`)
  }
}

export function canAffordBore(session: BotSession, planet: BotPlanet, ticks: number): boolean {
  const reserve = reserveQuanta(session, planet.layout, planet.pilot.position)
  return session.vehicle().energy - boreQuanta(ticks) >= reserve
}

/** A move down or along a tunnel the bot has opened, with the way home from its end in reserve. */
export function canAffordMoveTo(
  session: BotSession,
  planet: BotPlanet,
  target: TilePoint,
): boolean {
  const { layout, pilot } = planet
  const speed = botTravelSpeedOf(session.state(), session.playerId)
  const ways = { from: galleryWayOf(layout, pilot.position), to: galleryWayOf(layout, target) }
  const cost = isLevelMove(ways)
    ? levelMoveQuanta(layout, pilot.position, target, speed)
    : diagonalMoveQuanta(ways, speed)
  return session.vehicle().energy - cost >= reserveQuanta(session, layout, target)
}

/** The ways out of the tile the bot stands in and into the tile it moves to. */
interface MoveWays {
  from: GalleryWay
  to: GalleryWay
}

/** A move that neither leaves nor enters a zigzag gallery. */
function isLevelMove({ from, to }: MoveWays): boolean {
  return from.metres === from.reach && to.metres === to.reach
}

/** Along the tunnel and down the shaft at the drive rate, as the bot has always counted it. */
function levelMoveQuanta(
  layout: MineLayout,
  position: TilePoint,
  target: TilePoint,
  speed: number,
): number {
  const along =
    Math.abs(target.tx - position.tx) + Math.abs(position.tx - shaftColumnAt(layout, position.ty))
  const down = Math.max(0, position.ty - target.ty)
  return moveQuanta(moveTicks(along + down, speed), 0)
}

/**
 * Back along the gallery it stands in to the shaft, along the shaft between the two galleries'
 * rows, and out along the gallery it moves into: every metre at the drive rate, and the metres
 * that climb at the thrust rate too, as a 45° climb is both.
 */
function diagonalMoveQuanta({ from, to }: MoveWays, speed: number): number {
  const driveMetres = from.metres + Math.abs(from.row - to.row) + to.metres
  const outClimbMetres = to.metres - to.climbMetres
  const climbMetres = from.climbMetres + Math.max(0, to.row - from.row) + outClimbMetres
  return moveQuanta(moveTicks(driveMetres, speed), moveTicks(climbMetres, speed))
}

function reserveQuanta(session: BotSession, layout: MineLayout, from: TilePoint): number {
  const home = returnQuanta(session, layout, from)
  return (
    Math.ceil((home * RETURN_MARGIN_NUMERATOR) / RETURN_MARGIN_DENOMINATOR) + RETURN_SPARE_QUANTA
  )
}

/**
 * The energy the way home costs: along the gallery (zigzag legs at 45°, ticket 899), up the shaft and
 * along its jogs round lava (#113), over to the pad.
 */
export function returnQuanta(session: BotSession, layout: MineLayout, from: TilePoint): number {
  const speed = botTravelSpeedOf(session.state(), session.playerId)
  const way = galleryWayOf(layout, from)
  const along =
    way.metres +
    shaftJogLengthAbove(layout, way.row) +
    Math.abs(layout.shaftColumn - layout.sellBay.tx)
  const climb = way.climbMetres + Math.max(0, layout.travelRow - way.row)
  return moveQuanta(moveTicks(along, speed), moveTicks(climb, speed))
}
