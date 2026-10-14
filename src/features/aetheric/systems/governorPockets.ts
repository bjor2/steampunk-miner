/**
 * The governor's pockets as the kernel hears them (#263 on ticket 375's seam): an enemy standing
 * within any player's open, paid-for pocket, or on foam the pocket's still foam combo carries it
 * onto (ticket 373, `stillFoam.ts`), steps at `slowedEnemyStep` (#360, half speed); the kernel takes
 * the strongest slow, so two pockets never compound. The step is the only input from the enemy's
 * side; the vehicle is never read.
 *
 * The pocket clock (`clockSteps`) runs after the tick's enemies have stepped: it pays the next
 * tick's energy from each open pocket's tank, closing a pocket the tank cannot pay, and clears a
 * pocket once its last tick has passed, so a spent pocket leaves the section, the save and the
 * digest as if it never opened. With no pocket open it names no tick, so a quiet clock never stops
 * for it. Players are taken in id order.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { slowedEnemyStep } from '../../../systems/aetheric/slowPocket'
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import { isWithinMm, type MillimetrePoint } from '../../../systems/authority/combat/combatGeometry'
import { unchanged } from '../../../systems/authority/commandRule'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import type { EnemyStepModifier } from '../../../systems/registries/enemyStepModifiers'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { governorBalance } from './governorItem'
import { CLOSED, pocketOf, withPocket, type SlowPocket } from './pocketSection'
import { isOnStilledFoam } from './stilledBlocks'

const HALF_TILE_MM = MM_PER_METRE / 2

export const GOVERNOR_SLOW: EnemyStepModifier = {
  id: 'aetheric.chronometric_governor',
  modify: (step, enemy, state, tick) => slowedEnemyStep(step, isInHeldPocket(state, enemy, tick)),
}

export const POCKET_CLOCK: ClockStep = {
  id: 'aetheric.pockets',
  nextTick: (state) => (openPocketsOf(state).length === 0 ? null : state.tick + 1),
  run: (state, tick) => unchanged(withPocketsHeld(state, tick)),
}

/** Whether `enemy` stands in a pocket that holds at `tick`: opened, paid for and not yet ended. */
export function isInHeldPocket(state: AuthorityState, enemy: Enemy, tick: number): boolean {
  return openPocketsOf(state).some((pocket) => isHeldOver(pocket, enemy, tick))
}

function isHeldOver(pocket: SlowPocket, enemy: Enemy, tick: number): boolean {
  return isHeldAt(pocket, tick) && isCoveredBy(pocket, enemy)
}

function isCoveredBy(pocket: SlowPocket, enemy: Enemy): boolean {
  return isWithinMm(enemy, pocketCentreMm(pocket), pocket.reachMm) || isOnStilledFoam(pocket, enemy)
}

/** Whether the pocket slows enemies at `tick`: opened, paid for and not yet ended. */
export function isHeldAt(pocket: SlowPocket, tick: number): boolean {
  return tick <= pocket.paidThroughTick && tick <= pocket.lastTick
}

/** Whether the pocket is centred within its own reach of `tile`'s centre: the tile is inside it. */
export function isTileInPocket(pocket: SlowPocket, tile: TilePoint): boolean {
  return isWithinMm(tileCentreMmOf(tile), pocketCentreMm(pocket), pocket.reachMm)
}

function pocketCentreMm(pocket: SlowPocket): MillimetrePoint {
  return tileCentreMmOf({ tx: pocket.tx, ty: pocket.ty })
}

function tileCentreMmOf(tile: TilePoint): MillimetrePoint {
  return {
    x: tile.tx * MM_PER_METRE + HALF_TILE_MM,
    y: tile.ty * MM_PER_METRE + HALF_TILE_MM,
  }
}

function openPocketsOf(state: AuthorityState): SlowPocket[] {
  return playerIdsOf(state)
    .map((playerId) => pocketOf(state, playerId).pocket)
    .filter((pocket): pocket is SlowPocket => pocket !== null)
}

function withPocketsHeld(state: AuthorityState, tick: number): AuthorityState {
  return playerIdsOf(state).reduce(
    (current, playerId) => withPocketHeld(current, playerId, tick),
    state,
  )
}

/** Clears an ended pocket; otherwise pays through the next tick, or closes on a dry tank. */
function withPocketHeld(state: AuthorityState, playerId: string, tick: number): AuthorityState {
  const pocket = pocketOf(state, playerId).pocket
  if (pocket === null) return state
  if (tick >= pocket.lastTick) return withPocket(state, playerId, CLOSED)
  const ticksDue = tick + 1 - pocket.paidThroughTick
  if (!canPayTicks(state, playerId, ticksDue)) return withPocket(state, playerId, CLOSED)
  const paid = withTicksPaid(state, playerId, ticksDue)
  return withPocket(paid, playerId, { pocket: { ...pocket, paidThroughTick: tick + 1 } })
}

function canPayTicks(state: AuthorityState, playerId: string, ticks: number): boolean {
  return vehicleOf(state, playerId).energy >= energyOfTicks(ticks)
}

function withTicksPaid(state: AuthorityState, playerId: string, ticks: number): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  return withVehicle(state, playerId, { ...vehicle, energy: vehicle.energy - energyOfTicks(ticks) })
}

function energyOfTicks(ticks: number): number {
  return Math.max(0, ticks) * governorBalance().energyQuantaPerTick
}

function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
