/**
 * The shoring shot (ticket 369, piece iii of the #157 ground-strengthening seam; the GD ruling and
 * TD lock there, both Scalers signed off): the cementing round on the `bore_gun` node (Content's
 * renamed shoring shot on #310) holds every cell it opened as permanent ground. An authority
 * reaction to the kernel's bore, read off what the shot really did:
 *
 * - **Applied as the line ends.** When a line whose shot lays a lining (`BoreShot.liningType`,
 *   the cementing round's shape) ends, the cells it opened become shot cells (`shotCells.ts`),
 *   the same tick its walls are lined, well before its collapse check. Ownership is checked here,
 *   on apply: the player owns the cementing round and `casing_cement` is `FeatureUnlocked`.
 *   Reads never check it, so a shot cell holds for every player.
 * - **Priced in its own band.** Each new shot cell is billed as one metre of first lining in the
 *   shot's lining type at the band where the cell sits (`casingLiningPrice`: `k_casing` ore units
 *   of that band, times the type's multiplier), onto the vehicle's lining bill, which the Sell bay
 *   settles (#76 amendment): nothing leaves the wallet mid-dive. A cell already held is free.
 * - **Cutting removes it.** A shot cell that yields again (`TileDestroyed`) is no longer held.
 * - **Another planet is another world.** Travel and the debug planet commands drop every shot cell.
 *
 * The kernel guards (lava, the core, dynamite and rig gates) stand before the provider, and
 * collapse is its only reader: hardness, the drill_tip gate and the swept span never see it.
 */
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { boresOf, type PendingBore } from '../../../systems/authority/bore/boreState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { add, toCanonical, type Money } from '../../../systems/money'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { CASING_CEMENT_ROW, CEMENTING_ROUND_ITEM_ID } from './boreGunLane'
import { ownedModuleMarkOf } from './boreGunModules'
import { shotCellsPrice } from './shotCellPrice'
import {
  newShotCellsOf,
  shotCellsOf,
  withNoShotCells,
  withShotCellsAdded,
  withShotCellsCut,
} from './shotCells'

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /**
     * A cementing round's line ended and held the `cells` it opened as permanent ground, billed
     * `price` in total onto the lining bill, in its `liningType`.
     */
    'ground-gun.ShotCellsReinforced': { cells: number; liningType: string; price: string }
  }
}

export const SHORING_SHOT_REACTION: AuthorityReaction = {
  id: 'ground-gun.shoring-shot',
  react: (_before, after, events) => holdShotCells(after, events),
}

/** The events that put the session on another planet, whose world starts fresh. */
const PLANET_CHANGES: ReadonlySet<DomainEvent['type']> = new Set([
  'PlanetEntered',
  'PlanetChanged',
  'PlanetSeedChanged',
])

function holdShotCells(after: AuthorityState, events: readonly DomainEvent[]): RuleEffect {
  if (events.some((event) => PLANET_CHANGES.has(event.type))) {
    return unchanged(withNoShotCells(after))
  }
  return reinforceEndedLines(withCutCellsDropped(after, events), events)
}

/** The state without the shot cells the step cut again. */
function withCutCellsDropped(
  state: AuthorityState,
  events: readonly DomainEvent[],
): AuthorityState {
  if (Object.keys(shotCellsOf(state)).length === 0) return state
  return withShotCellsCut(state, cutTilesOf(events))
}

function cutTilesOf(events: readonly DomainEvent[]): TilePoint[] {
  return events.flatMap((event) =>
    event.type === 'TileDestroyed' ? [{ tx: event.tx, ty: event.ty }] : [],
  )
}

/** Every cemented line the player's step ended holds its opened cells, when the player may. */
function reinforceEndedLines(state: AuthorityState, events: readonly DomainEvent[]): RuleEffect {
  const playerId = events[0]?.playerId
  const params = planetParamsOf(state.planet)
  if (playerId === undefined || params === null || !mayReinforce(state, playerId)) {
    return unchanged(state)
  }
  return chainEffects(
    state,
    endedCementedLinesOf(state, playerId, events).map(
      (line) => (current: AuthorityState) => reinforceLine(current, params, line),
    ),
  )
}

/** Checked on apply, never on read: the cementing round owned and `casing_cement` open. */
export function mayReinforce(state: AuthorityState, playerId: string): boolean {
  if (!Object.hasOwn(state.players, playerId)) return false
  const ownsRound = ownedModuleMarkOf(state, playerId, CEMENTING_ROUND_ITEM_ID) > 0
  return ownsRound && isFeatureUnlocked(state, CASING_CEMENT_ROW)
}

/**
 * The player's lining lines that ended in a heard `BoreEnded`: a line that opened cells keeps its
 * end tick plus its hold as its `checkTick` until its collapse check runs.
 */
function endedCementedLinesOf(
  state: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): PendingBore[] {
  const endTicks = new Set(
    events.filter((event) => event.type === 'BoreEnded').map((event) => event.tick),
  )
  return boresOf(state).filter((line) => isEndedLiningLine(line, playerId, endTicks))
}

function isEndedLiningLine(
  line: PendingBore,
  playerId: string,
  endTicks: ReadonlySet<number>,
): boolean {
  if (line.playerId !== playerId || line.shot.liningType === undefined) return false
  return line.checkTick !== null && endTicks.has(line.checkTick - line.shot.collapseHoldTicks)
}

function reinforceLine(state: AuthorityState, params: PlanetParams, line: PendingBore): RuleEffect {
  const cells = newShotCellsOf(state, line.bored)
  const liningType = line.shot.liningType
  if (cells.length === 0 || liningType === undefined) return unchanged(state)
  const price = shotCellsPrice(params, cells, liningType)
  return {
    state: withShotCellsAdded(withLiningBilled(state, line.playerId, price), cells),
    events: [reinforcedOf(cells.length, liningType, toCanonical(price))],
  }
}

function withLiningBilled(state: AuthorityState, playerId: string, price: Money): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  return withVehicle(state, playerId, { ...vehicle, liningBill: add(vehicle.liningBill, price) })
}

function reinforcedOf(cells: number, liningType: string, price: string): DomainEventBody {
  return { type: 'ground-gun.ShotCellsReinforced', cells, liningType, price }
}
