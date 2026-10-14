/**
 * The Deep Striker twist on the echo sounder (spec #162, "Artefact twists"; ticket 329 as 206c):
 * held, the sounder's ping becomes an aimed downward cone that reaches into the band below instead
 * of a ring around the miner. Reveals only, like every ping (#203): the client reads it from the
 * use and the state it hears it with.
 *
 * The lane asks the kernel `twist` point (base 0, ceiling 1), so it never imports the artefact
 * slice. The cone sits under the sounder's cap: it spends the ring's cell budget, as long and
 * narrow as the ring is round. A cone of half-angle θ and length L covers L²θ, the ring πr²; with
 * θ = 30° (tangent 577‰) the two match at L² = 6r², so a 12-tile ring becomes a 29-tile cone.
 * "Down" is the miner's own down, against the pose's up vector, so the cone points at the core.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { scalarHookValueOf } from '../../../systems/registries/itemHooks'
import type { IntegerVector } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { ECHO_SOUNDER, type SensingUse } from './sensingUses'

/** tan 30°, the cone's half-angle, in thousandths. */
export const CONE_HALF_TAN_PER_MILLE = 577
/** L² = 6r²: the 30° cone's area equals the ring's (π / (π/6) = 6). */
export const CONE_LENGTH_SQ_PER_RADIUS_SQ = 6

const PER_MILLE = 1000

/**
 * The down the use's cone points along, or null when the ping stays a ring: no twist held, or no
 * pose to take a down from.
 */
export function twistedDownOf(
  use: SensingUse,
  state: AuthorityState,
  radiusTiles: number,
): IntegerVector | null {
  return isEchoTwisted(use, state, radiusTiles) ? downOf(state, use.playerId) : null
}

/** Whether the use's player holds the sounder's twist: the kernel hook answers 1, or nothing. */
export function isEchoTwisted(
  use: SensingUse,
  state: AuthorityState,
  radiusTiles: number,
): boolean {
  const twist = scalarHookValueOf(state, use.playerId, {
    point: 'twist',
    parentItemId: ECHO_SOUNDER,
    ctx: {
      tick: use.tick,
      mark: use.mark,
      magnitude: radiusTiles,
      origin: use.origin,
      candidates: [],
    },
    base: 0,
    ceiling: 1,
  })
  return twist > 0
}

/** The miner's down as an integer vector; null with no pose, when the ping stays a ring. */
export function downOf(state: AuthorityState, playerId: string): IntegerVector | null {
  const pose = state.players[playerId]?.vehicle.pose ?? null
  return pose === null ? null : { x: -pose.upx, y: -pose.upy }
}

/**
 * The tiles of the cone from `origin` along `down` that a ring of `radiusTiles` trades for: every
 * tile centre within √6 r and 30° of the axis, row by row, then column by column.
 */
export function echoConeTilesOf(
  origin: TilePoint,
  down: IntegerVector,
  radiusTiles: number,
): TilePoint[] {
  const lengthSq = CONE_LENGTH_SQ_PER_RADIUS_SQ * radiusTiles * radiusTiles
  const length = Math.floor(Math.sqrt(lengthSq))
  const tiles: TilePoint[] = []
  for (let dy = -length; dy <= length; dy++) {
    for (let dx = -length; dx <= length; dx++) {
      const offset = { x: dx, y: dy }
      if (isInCone(offset, down, lengthSq)) tiles.push({ tx: origin.tx + dx, ty: origin.ty + dy })
    }
  }
  return tiles
}

/** Within the length, ahead along the axis, and off it by at most the half-angle's tangent. */
function isInCone(offset: IntegerVector, axis: IntegerVector, lengthSq: number): boolean {
  if (offset.x * offset.x + offset.y * offset.y > lengthSq) return false
  const along = offset.x * axis.x + offset.y * axis.y
  const across = Math.abs(offset.x * axis.y - offset.y * axis.x)
  return along > 0 && across * PER_MILLE <= CONE_HALF_TAN_PER_MILLE * along
}
