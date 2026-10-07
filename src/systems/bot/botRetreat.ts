/**
 * The pacing bot's last way on when no trip pays, not even after widening a held band (#216): a
 * broke bot whose tank is below what a tow leaves strands itself for the tow. #8 makes the tow
 * leave at least 25% of the tank "to avoid a soft-lock for a broke player", its fee never takes the
 * wallet below zero, and energy 0 strands the vehicle only off the pad (#7), so the bot drives to
 * the shaft head, shuttles along the travel row there until the tank is dry, and waits for the tow,
 * as a broke player would. With a tank at or above the tow's floor a tow gives nothing, and the run
 * has nothing left to try.
 */
import { rescueFloorQuanta } from '../vehicle/energyQuanta'
import { isVehicleActive, statsOfVehicle } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { moveStraight, type BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { leavePad, waitForTow } from './botTrip'
import { moveQuanta, moveTicks } from './botWorld'
import { shaftTileAt } from './mineLayout'

/** Shuttle legs past the movement model's count before a vehicle still running is a bot bug. */
const SPARE_SHUTTLE_LEGS = 8

/** Strands the bot for a tow when the tow would fill the tank more; false when it would not. */
export function towWhenItRefills(session: BotSession, planet: BotPlanet): boolean {
  if (!isTowWorthMoreThanTank(session)) return false
  strandForTow(session, planet)
  return true
}

function isTowWorthMoreThanTank(session: BotSession): boolean {
  const vehicle = session.vehicle()
  return vehicle.energy < rescueFloorQuanta(vehicle.levels.boiler)
}

function strandForTow(session: BotSession, planet: BotPlanet): void {
  leavePad(session)
  moveStraight(session, planet, shaftHeadOf(planet))
  shuttleUntilStranded(session, planet)
  waitForTow(session, planet)
}

/** The shaft's top tile on the travel row, two tiles off the pad and so outside its zone (#7). */
function shaftHeadOf(planet: BotPlanet): TilePoint {
  return shaftTileAt(planet.layout, planet.layout.travelRow)
}

/** One tile toward the pad and back, on ground every trip has opened, until the tank is dry. */
function shuttleUntilStranded(session: BotSession, planet: BotPlanet): void {
  const head = shaftHeadOf(planet)
  const padward = { tx: head.tx + Math.sign(planet.layout.sellBay.tx - head.tx), ty: head.ty }
  const maxLegs = shuttleLegsToEmpty(session) + SPARE_SHUTTLE_LEGS
  for (let leg = 0; leg < maxLegs && isVehicleActive(session.vehicle()); leg++) {
    moveStraight(session, planet, leg % 2 === 0 ? padward : head)
  }
  if (isVehicleActive(session.vehicle())) {
    throw new Error('the bot shuttled past its tank without stranding')
  }
}

function shuttleLegsToEmpty(session: BotSession): number {
  const speed = statsOfVehicle(session.vehicle()).engine.speedMax
  return Math.ceil(session.vehicle().energy / moveQuanta(moveTicks(1, speed), 0))
}
