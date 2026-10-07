/**
 * Signal buoys (#162 Sensing row, 4.3): a dropped buoy pins its tile for everyone in the world,
 * and re-pings its ring each time a vehicle passes, meaning each time one comes inside the ring
 * from outside it. Every client hears every player's drop and reads every vehicle's pose from
 * the same authority state, so each one keeps the same pins (#162 3.2, shared with everyone).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'

export interface BuoyPin {
  tile: TilePoint
  ownerId: string
  placedTick: number
  /** The re-ping ring's radius at the Mark it was dropped at. */
  ringTiles: number
  /** The players whose vehicle stood inside the ring when last read, sorted. */
  inside: readonly string[]
}

/** The pins with one more dropped, never more than `cap`: the oldest pin leaves first. */
export function pinsWithBuoy(pins: readonly BuoyPin[], pin: BuoyPin, cap: number): BuoyPin[] {
  return [...pins, pin].slice(-cap)
}

/** A pin at `tile`, with whoever stands inside its ring as it lands. */
export function droppedPinOf(
  state: AuthorityState,
  drop: { tile: TilePoint; ownerId: string; placedTick: number; ringTiles: number },
): BuoyPin {
  return { ...drop, inside: playersInsideRingOf(state, drop.tile, drop.ringTiles) }
}

/** The pin as read now, and whether a vehicle came inside its ring since it was last read. */
export function pinAfterPasses(
  state: AuthorityState,
  pin: BuoyPin,
): { pin: BuoyPin; isPassed: boolean } {
  const inside = playersInsideRingOf(state, pin.tile, pin.ringTiles)
  const isPassed = inside.some((playerId) => !pin.inside.includes(playerId))
  return { pin: isSameSet(inside, pin.inside) ? pin : { ...pin, inside }, isPassed }
}

function playersInsideRingOf(state: AuthorityState, tile: TilePoint, ringTiles: number): string[] {
  return Object.keys(state.players)
    .sort()
    .filter((playerId) => isInsideRing(state, playerId, tile, ringTiles))
}

function isInsideRing(
  state: AuthorityState,
  playerId: string,
  tile: TilePoint,
  ringTiles: number,
): boolean {
  const pose = state.players[playerId].vehicle.pose
  if (pose === null) return false
  const at = tileOfPose(pose)
  const dx = at.tx - tile.tx
  const dy = at.ty - tile.ty
  return dx * dx + dy * dy <= ringTiles * ringTiles
}

function isSameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((playerId, at) => playerId === b[at])
}
