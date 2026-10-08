/**
 * Where and how far a sensing use reveals, as the Mark milestone it was and the link that fired it
 * say (the GD lock on #256, `sensingMilestones.ts`). A plain use reveals as #203 built it. Every
 * reading is of the state the client holds when it hears the use, so each client draws the same.
 *
 * - The echo sounder's second tap centres its ping one radius ahead along the facing; its hold
 *   keeps the ping twice as long.
 * - The flare mortar's second tap lobs the shell behind the miner; its hold lobs it twice as far.
 * - The signal buoy's second tap drops it one ring ahead along the facing; its hold one ring behind,
 *   away from the drill (Content's where-fix on #276, so facing down the hold never lands on the
 *   tap's tile). It reads no drive.
 * - Fired by a sibling-link, each reveals at the link's reduced strength: the echo's radius, the
 *   flare's mapped radius and the buoy's ring (the lock's "at half radius").
 */
import { UP_VECTOR_SCALE } from '../../../constants/physics'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { facingVectorOf, type IntegerVector } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { atLinkStrength } from '../../power-up-core'
import { flareLandingOf } from './flareMortar'
import {
  buoyRingTilesAt,
  echoRadiusTiles,
  echoRevealTicksAt,
  flareRadiusTilesAt,
  flareRangeTiles,
} from './revealReach'
import type { SensingUse } from './sensingUses'

/** "Twice as long", "twice as far" (#256 hold verbs). */
const HOLD_STRETCH = 2

export function echoCentreOf(use: SensingUse, state: AuthorityState): TilePoint {
  if (use.milestone !== 'second-tap') return use.origin
  return tilesAlong(use.origin, facingOf(state, use.playerId), echoRadiusTiles())
}

export function echoRadiusOf(use: SensingUse): number {
  return atLinkStrengthWhenLinked(use, echoRadiusTiles())
}

/** The first tick the ping is gone on. */
export function echoUntilOf(use: SensingUse): number {
  const stretch = use.milestone === 'hold' ? HOLD_STRETCH : 1
  return use.tick + stretch * echoRevealTicksAt(use.mark)
}

/** Where the shell lands: its range along the facing, behind for a second tap, twice for a hold. */
export function flareLandingOfUse(use: SensingUse, state: AuthorityState): TilePoint {
  return flareLandingOf(
    state,
    use.playerId,
    use.origin,
    flareRangeTiles() * flareRangeStretchOf(use),
  )
}

export function flareRadiusOf(use: SensingUse): number {
  return atLinkStrengthWhenLinked(use, flareRadiusTilesAt(use.mark))
}

export function buoyTileOf(use: SensingUse, state: AuthorityState): TilePoint {
  const ring = buoyRingTilesAt(use.mark)
  if (use.milestone === 'second-tap')
    return tilesAlong(use.origin, facingOf(state, use.playerId), ring)
  if (use.milestone === 'hold') return tilesAlong(use.origin, behindOf(state, use.playerId), ring)
  return use.origin
}

export function buoyRingOf(use: SensingUse): number {
  return atLinkStrengthWhenLinked(use, buoyRingTilesAt(use.mark))
}

/** -1 lobs behind, 2 twice as far, 1 as bought. */
function flareRangeStretchOf(use: SensingUse): number {
  if (use.milestone === 'second-tap') return -1
  return use.milestone === 'hold' ? HOLD_STRETCH : 1
}

function atLinkStrengthWhenLinked(use: SensingUse, value: number): number {
  return use.isLinked ? atLinkStrength(value) : value
}

/** The player's facing, as an up-vector-scale vector; none with no pose. */
function facingOf(state: AuthorityState, playerId: string): IntegerVector {
  const pose = state.players[playerId]?.vehicle.pose ?? null
  return pose === null ? { x: 0, y: 0 } : facingVectorOf(pose.upx, pose.upy, pose.facing)
}

/** The facing turned round: away from the drill. */
function behindOf(state: AuthorityState, playerId: string): IntegerVector {
  const facing = facingOf(state, playerId)
  return { x: -facing.x, y: -facing.y }
}

/** `tiles` whole tiles from `origin` along `direction`. */
function tilesAlong(origin: TilePoint, direction: IntegerVector, tiles: number): TilePoint {
  return {
    tx: origin.tx + Math.round((direction.x * tiles) / UP_VECTOR_SCALE),
    ty: origin.ty + Math.round((direction.y * tiles) / UP_VECTOR_SCALE),
  }
}
