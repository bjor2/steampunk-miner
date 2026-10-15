/**
 * The spotter's pre-train on a due shot (K-pretrain, ticket 413; TD lock 6180863028 and GD ruling
 * 6180873822 on #320), derived on each due tick from the turret shape and the saved
 * `gunReadyTick`, so nothing is saved and no protocol changes:
 *
 * - The window runs `pretrainTicks` ticks from the due tick (`gunReadyTick`).
 * - The shot holds before the window's last tick while one of the player's burrowers is in rock and
 *   reaches an open cell within the ticks left (`dustTrailWarningsOf`), and none has broken the
 *   surface since the due tick. It fires on the tick one breaks the surface, or at the cap.
 * - A shot fired late inside the window ranks the burrowers that just broke the surface first among
 *   the targets in line of fire (the GD's ranking rule). It never turns toward a burrower in rock:
 *   the aim still takes only targets in line of fire, in the shape's order for every other one.
 * - Every shot inside the window keeps the schedule: the next due tick counts from the due tick,
 *   not the fire tick, so the spotter adds and loses no shot. Spacing runs short once, by at most
 *   the cap, when the shot fired late (TD default 4, accepted by the GD).
 *
 * "Broke the surface" is read from where the burrower stands, as nothing is saved: in an open cell
 * with rock within one walking step (`surfacedBurrowerIdsOf`). With `pretrainTicks` null nothing is
 * read and the guns shoot as before.
 */
import type { TurretShape } from '../../registries/autoGuns'
import type { AuthorityState } from '../authorityState'
import { combatVehicleOf } from './combatState'
import { dustTrailWarningsOf, surfacedBurrowerIdsOf } from './dustTrail'
import type { StepGround, Terrain } from './enemyMovement'
import type { VehicleTarget } from './vehicleTarget'

export interface Pretrain {
  /** The tick the next due tick counts its interval from. */
  scheduleTick: number
  isHolding: boolean
  /** Burrowers that broke the surface inside the window: first among targets in line of fire. */
  surfacedIds: ReadonlySet<string>
}

/** The due tick, how far past it the shot is, and the shape's reach and hold. */
interface PretrainWindow {
  readyTick: number
  elapsed: number
  pretrainTicks: number
  reachTiles: number
}

const NO_SURFACED: ReadonlySet<string> = new Set()

/** The pre-train on this tick's due shot; an on-time shot with no window or no pre-train. */
export function pretrainOf(
  state: AuthorityState,
  terrain: Terrain,
  target: VehicleTarget,
  shape: TurretShape,
  tick: number,
): Pretrain {
  const window = pretrainWindowOf(state, target.playerId, shape, tick)
  if (window === null) return onTimeShotAt(tick)
  return pretrainWithin({ state, terrain, tick }, target.playerId, window)
}

function pretrainWindowOf(
  state: AuthorityState,
  playerId: string,
  { pretrainTicks, rangeTiles }: TurretShape,
  tick: number,
): PretrainWindow | null {
  if (pretrainTicks === null) return null
  const readyTick = combatVehicleOf(state.combat, playerId).gunReadyTick
  const elapsed = tick - readyTick
  return elapsed <= pretrainTicks
    ? { readyTick, elapsed, pretrainTicks, reachTiles: rangeTiles }
    : null
}

function onTimeShotAt(tick: number): Pretrain {
  return { scheduleTick: tick, isHolding: false, surfacedIds: NO_SURFACED }
}

function pretrainWithin(ground: StepGround, playerId: string, window: PretrainWindow): Pretrain {
  const surfacedIds = surfacedSinceDueOf(ground, playerId, window)
  return {
    scheduleTick: window.readyTick,
    isHolding: surfacedIds.size === 0 && isTrailStillUnder(ground, playerId, window),
    surfacedIds,
  }
}

/** On the due tick itself nothing has been held, so no burrower ranks first. */
function surfacedSinceDueOf(
  ground: StepGround,
  playerId: string,
  { elapsed }: PretrainWindow,
): ReadonlySet<string> {
  return elapsed > 0 ? surfacedBurrowerIdsOf(ground, playerId) : NO_SURFACED
}

/** Before the cap, a burrower in rock reaches the open within the ticks the hold has left. */
function isTrailStillUnder(ground: StepGround, playerId: string, window: PretrainWindow): boolean {
  const ticksLeft = window.pretrainTicks - window.elapsed
  if (ticksLeft <= 0) return false
  const { state, tick } = ground
  return dustTrailWarningsOf(state, playerId, window.reachTiles, ticksLeft, tick).length > 0
}
