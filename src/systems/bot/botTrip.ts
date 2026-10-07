/**
 * One trip of the pacing bot (#29): leave the pad (from either bay), go down the shaft to a gallery, bore it out
 * (on a core trip, taking the core tiles just above and below on the way), and turn home while
 * the tank still holds the climb back plus a margin (`botEnergy.ts`), or the heat gauge is near its
 * max (#113, `botHeat.ts`). A trip ends docked at the Sell bay, or towed after a strand or a death,
 * which the bot never causes on purpose but combat can.
 */
import { coreNeededOf } from '../authority/coreBay'
import { dockCommand, undockCommand } from '../platform/platformCommands'
import { cargoUnitsOf, isVehicleActive, statsOfVehicle } from '../vehicle/vehicleState'
import type { BayId } from '../world/dockBays'
import type { TilePoint } from '../world/tileGrid'
import { boreInPlace, openTile } from './botDig'
import { assertReturnReserve, canAffordMoveTo } from './botEnergy'
import { coolAtDock, isTooHotToDig } from './botHeat'
import { moveStraight, type BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { boreShaftDownTo, moveAlongShaft } from './botShaft'
import { isInsideWorld, tileKindAt, type BotTileKind } from './botWorld'
import {
  extendSide,
  galleryEndOf,
  galleryFaceOf,
  isCoreTileAt,
  isNearSurface,
  markSideDone,
  oreReachOf,
  shaftColumnAt,
  shaftTileAt,
  type GallerySide,
  type MineLayout,
} from './mineLayout'
import { nextRow, sideFor, type TripGoal } from './tripGoal'

type GalleryEnd = 'stop' | 'ended'

const TOW_WAIT_TICKS = 30

export function runTrip(session: BotSession, planet: BotPlanet, goal: TripGoal): void {
  assertReturnReserve(session, planet, goal)
  coolAtDock(session)
  leavePad(session)
  openPathTo(session, planet, shaftTileAt(planet.layout, planet.layout.travelRow))
  mineUntilTurnBack(session, planet, goal)
  if (isVehicleActive(session.vehicle())) returnAndDock(session, planet)
  else waitForTow(session, planet)
}

/** Drives from the Sell bay to the Upgrade bay (#37) and docks there, to buy. */
export function driveToUpgradeBay(session: BotSession, planet: BotPlanet): void {
  driveToBay(session, planet, 'upgrade', planet.layout.upgradeBay)
}

/** Drives along the pad to the Refinery bay (#105) and docks there, to queue a batch. */
export function driveToRefineryBay(session: BotSession, planet: BotPlanet, bay: TilePoint): void {
  driveToBay(session, planet, 'refinery', bay)
}

/** Drives back to the Sell bay and docks there, to collect and sell. */
export function driveToSellBay(session: BotSession, planet: BotPlanet): void {
  driveToBay(session, planet, 'sell', planet.layout.sellBay)
}

function driveToBay(session: BotSession, planet: BotPlanet, bay: BayId, tile: TilePoint): void {
  leavePad(session)
  moveStraight(session, planet, tile)
  session.submit(dockCommand(bay))
}

export function leavePad(session: BotSession): void {
  if (session.vehicle().mode === 'docked') session.submit(undockCommand())
}

function mineUntilTurnBack(session: BotSession, planet: BotPlanet, goal: TripGoal): void {
  for (let row = nextRow(planet.layout, goal); row !== null; row = nextRow(planet.layout, goal)) {
    const side = sideFor(planet.layout, row, goal)
    if (side === null || !reachRow(session, planet, row)) return
    if (mineGallerySide(session, planet, row, side, goal) === 'stop') return
  }
}

/** Down the open shaft, then bores it deeper; false when it cannot or should not go on. */
function reachRow(session: BotSession, planet: BotPlanet, row: number): boolean {
  const { layout, pilot } = planet
  const openBottom = shaftTileAt(layout, Math.max(row, layout.shaftBottomRow))
  if (!canAffordMoveTo(session, planet, openBottom)) return false
  moveStraight(session, planet, shaftTileAt(layout, pilot.position.ty))
  moveAlongShaft(session, planet, openBottom.ty)
  return boreShaftDownTo(session, planet, row)
}

/** The way from the pad to the shaft, opened tile by tile the first time (#4 terrain may bulge). */
function openPathTo(session: BotSession, planet: BotPlanet, target: TilePoint): void {
  while (planet.pilot.position.tx !== target.tx) {
    const step = Math.sign(target.tx - planet.pilot.position.tx)
    const next = { tx: planet.pilot.position.tx + step, ty: planet.pilot.position.ty }
    if (openTile(session, planet, next) !== 'opened') return
  }
}

function mineGallerySide(
  session: BotSession,
  planet: BotPlanet,
  row: number,
  side: GallerySide,
  goal: TripGoal,
): GalleryEnd {
  const end = galleryEndOf(planet.layout, row, side)
  if (!canAffordMoveTo(session, planet, end)) return 'stop'
  moveStraight(session, planet, end)
  for (;;) {
    if (!harvestBesides(session, planet, goal)) return 'stop'
    const face = galleryFaceOf(planet.layout, row, side)
    if (isGalleryEnd(session, planet.layout, face, side, goal)) {
      markSideDone(planet.layout, row, side)
      return 'ended'
    }
    const opened = openTile(session, planet, face)
    if (opened === 'short') return 'stop'
    if (opened === 'blocked') {
      markSideDone(planet.layout, row, side)
      return 'ended'
    }
    extendSide(planet.layout, row, side)
  }
}

/** Bores the wanted tiles just above and below the vehicle; false when the trip must turn back. */
function harvestBesides(session: BotSession, planet: BotPlanet, goal: TripGoal): boolean {
  const { position } = planet.pilot
  if (position.tx === shaftColumnAt(planet.layout, position.ty))
    return !isTurningBack(session, planet, goal)
  for (const tile of [
    { tx: position.tx, ty: position.ty + 1 },
    { tx: position.tx, ty: position.ty - 1 },
  ]) {
    if (isTurningBack(session, planet, goal)) return false
    if (isWanted(tileKindAt(session.state(), tile), goal)) boreInPlace(session, planet, tile)
  }
  return !isTurningBack(session, planet, goal)
}

/**
 * Only core is taken from beside a gallery. Ore comes from the gallery's own tiles at the band's
 * density, as in the #6 simulator the pacing targets were set with; picking ore out of the walls
 * would make the bot a better miner than the model the targets assume.
 */
function isWanted(kind: BotTileKind, goal: TripGoal): boolean {
  return goal.kind === 'core' && kind === 'core'
}

function isGalleryEnd(
  session: BotSession,
  layout: MineLayout,
  face: TilePoint,
  side: GallerySide,
  goal: TripGoal,
): boolean {
  const state = session.state()
  const reach = Math.abs(face.tx - shaftColumnAt(layout, face.ty))
  if (goal.kind === 'ore' && reach > oreReachOf(layout, goal.band)) return true
  if (!isInsideWorld(state, face) || isNearSurface(layout, face)) return true
  if (tileKindAt(state, face) === 'pad') return true
  if (goal.kind === 'ore') return isCoreTileAt(layout, face)
  return isPastTheCore(layout, face, side)
}

function isPastTheCore(layout: MineLayout, face: TilePoint, side: GallerySide): boolean {
  const reach = layout.params.coreRadiusTiles + 1
  return side === 'west' ? face.tx < -reach : face.tx > reach
}

/** Full hold, the planet's core needs no more, a vehicle no longer under control, or too hot. */
function isTurningBack(session: BotSession, planet: BotPlanet, goal: TripGoal): boolean {
  const vehicle = session.vehicle()
  if (!isVehicleActive(vehicle) || isTooHotToDig(session, planet)) return true
  if (cargoUnitsOf(vehicle.cargo) >= statsOfVehicle(vehicle).cargoCapacity) return true
  return goal.kind === 'core' && isCoreCarriedEnough(session)
}

function isCoreCarriedEnough(session: BotSession): boolean {
  const state = session.state()
  const needed = coreNeededOf(state.planet) ?? 0
  return state.platform.coreBay + session.vehicle().cargo.coreFragments >= needed
}

function returnAndDock(session: BotSession, planet: BotPlanet): void {
  const { layout, pilot } = planet
  moveStraight(session, planet, shaftTileAt(layout, pilot.position.ty))
  moveAlongShaft(session, planet, layout.travelRow)
  moveStraight(session, planet, layout.sellBay)
  if (isVehicleActive(session.vehicle())) session.submit(dockCommand('sell'))
  else waitForTow(session, planet)
}

/**
 * A stranded or destroyed vehicle is towed home after its grace or delay (#7); a destroyed one
 * leaves the bot watching its flanks on this planet from then on (#130).
 */
export function waitForTow(session: BotSession, planet: BotPlanet): void {
  if (session.vehicle().mode === 'destroyed') planet.hasBeenDestroyedHere = true
  while (session.vehicle().mode !== 'docked') session.wait(TOW_WAIT_TICKS)
  planet.pilot.position = planet.layout.sellBay
}
