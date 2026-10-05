/**
 * The bot's energy budget on a trip (#29, #33 section 5): every bore and every move must leave the
 * straight way home in the tank, with a fifth again and one unit to spare, so the bot turns back
 * in time and never strands itself; combat can still cost it the vehicle.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { returnReserveUnits } from '../vehicle/returnReserve'
import { statsOfVehicle } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { boreQuanta, moveQuanta, moveTicks } from './botWorld'
import type { MineLayout } from './mineLayout'
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
  const { position } = planet.pilot
  const speed = statsOfVehicle(session.vehicle()).engine.speedMax
  const along =
    Math.abs(target.tx - position.tx) + Math.abs(position.tx - planet.layout.shaftColumn)
  const down = Math.max(0, position.ty - target.ty)
  const cost = moveQuanta(moveTicks(along + down, speed), 0)
  return session.vehicle().energy - cost >= reserveQuanta(session, planet.layout, target)
}

function reserveQuanta(session: BotSession, layout: MineLayout, from: TilePoint): number {
  const home = returnQuanta(session, layout, from)
  return (
    Math.ceil((home * RETURN_MARGIN_NUMERATOR) / RETURN_MARGIN_DENOMINATOR) + RETURN_SPARE_QUANTA
  )
}

/** The energy the straight way home costs: along the gallery, up the shaft, over to the pad. */
export function returnQuanta(session: BotSession, layout: MineLayout, from: TilePoint): number {
  const speed = statsOfVehicle(session.vehicle()).engine.speedMax
  const along =
    Math.abs(from.tx - layout.shaftColumn) + Math.abs(layout.shaftColumn - layout.dockPoint.tx)
  const climb = Math.max(0, layout.travelRow - from.ty)
  return moveQuanta(moveTicks(along, speed), moveTicks(climb, speed))
}
