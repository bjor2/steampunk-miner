/**
 * The bot's moves along a gallery (#29; ticket 899): out from the shaft to a tile of a gallery,
 * and back from where it stands to the shaft, through the gallery's open tiles. Along a level
 * gallery that is one straight move, as it always was; along a zigzag one, a straight 45° move a
 * leg (`galleryWays.ts`).
 */
import type { TilePoint } from '../world/tileGrid'
import { moveStraight, type BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { galleryWaypointsOf, galleryWayOf } from './galleryWays'

/** From where the bot stands back along its gallery to the shaft tile the gallery leaves from. */
export function moveBackToShaft(session: BotSession, planet: BotPlanet): void {
  const way = galleryWayOf(planet.layout, planet.pilot.position)
  moveThrough(session, planet, galleryWaypointsOf(planet.layout, way, way.reach, 0))
}

/** From the shaft tile of `tile`'s gallery out along it to `tile`. */
export function moveOutAlongGallery(session: BotSession, planet: BotPlanet, tile: TilePoint) {
  const way = galleryWayOf(planet.layout, tile)
  moveThrough(session, planet, galleryWaypointsOf(planet.layout, way, 0, way.reach))
}

function moveThrough(session: BotSession, planet: BotPlanet, waypoints: readonly TilePoint[]) {
  for (const waypoint of waypoints) moveStraight(session, planet, waypoint)
}
