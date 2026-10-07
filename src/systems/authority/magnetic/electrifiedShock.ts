/**
 * The electrified cells' shock (GD lock on spec #258 Q2 and Q6, ticket 290). An electrified cell
 * the drill cuts takes `shockTicks` longer to drill, and when it breaks the shock costs
 * `shockHullShareBp` of the planet's on-curve hull while the dive's shocks have taken less than
 * `diveHullCapBp` (`magneticHazard.ts`). The shock is a hazard, never a gate: no gate is asked about
 * it, and it bills nothing, since the hull is mended at the existing repair price. A shielded cut
 * (`shockShields`, the dielectric bit) takes neither the ticks nor the hull, and says `withBit`.
 * Only the drill shocks: a blast or a terrain edit breaking the cell does not.
 */
import { cmp, sub, ZERO_MONEY, type BigStat } from '../../money'
import { onCurveHullShareOf, shockHullBpAfter, shockTicks } from '../../economy/magneticHazard'
import { isElectrifiedCellAt } from '../../registries/magneticGround'
import { isDrillShielded } from '../../registries/shockShields'
import type { YieldedCell } from '../../world/cellYield'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { destroyIfHullGone } from '../vehicleTransitions'

/** How a player's drill meets an electrified cell's shock: its ticks per cell. */
export type ShockTicksAt = (params: PlanetParams, tile: TilePoint, cell: number) => number

/** The ticks an electrified cell's shock adds to an unshielded drill's time; 0 for any other. */
export const unshieldedShockTicksAt: ShockTicksAt = (params, tile, cell) =>
  isElectrifiedCellAt(params, tile, cell) ? shockTicks() : 0

const NO_SHOCK_TICKS: ShockTicksAt = () => 0

/** The shock ticks the player's drill pays now: none while a shield covers it. */
export function shockTicksFor(state: AuthorityState, playerId: string): ShockTicksAt {
  return isDrillShielded(state, playerId) ? NO_SHOCK_TICKS : unshieldedShockTicksAt
}

/** Every electrified cell the player's drill broke shocks it, then a hull at 0 wrecks it. */
export function shockElectrifiedCells(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  broken: readonly YieldedCell[],
): RuleEffect {
  const electrified = broken.filter(({ tile, cell }) => isElectrifiedCellAt(params, tile, cell))
  if (electrified.length === 0) return unchanged(state)
  const shock = isDrillShielded(state, playerId) ? shieldedShockOf : hullShockOf(params)
  return chainEffects(state, [
    ...electrified.map(({ tile }) => shockStepAt(shock, playerId, tile)),
    (current) => destroyIfHullGone(current, playerId, current.tick, 'electrified'),
  ])
}

type CellShock = (state: AuthorityState, playerId: string, tile: TilePoint) => RuleEffect

function shockStepAt(shock: CellShock, playerId: string, tile: TilePoint) {
  return (state: AuthorityState) => shock(state, playerId, tile)
}

function shieldedShockOf(state: AuthorityState, _playerId: string, tile: TilePoint): RuleEffect {
  return { state, events: [shockedEvent(tile, 0, 0, true)] }
}

/** The shock's share of the on-curve hull, out of what the dive's cap still leaves. */
function hullShockOf(params: PlanetParams): CellShock {
  return (state, playerId, tile) => {
    const vehicle = vehicleOf(state, playerId)
    const taken = vehicle.shockHullBp ?? 0
    const hullBp = shockHullBpAfter(taken)
    const hull = atLeastZero(sub(vehicle.hull, onCurveHullShareOf(params.planetIndex, hullBp)))
    const shocked = { ...vehicle, hull, shockHullBp: taken + hullBp }
    return {
      state: withVehicle(state, playerId, shocked),
      events: [shockedEvent(tile, shockTicks(), hullBp, false)],
    }
  }
}

function shockedEvent(
  tile: TilePoint,
  ticks: number,
  hullBp: number,
  withBit: boolean,
): DomainEventBody {
  return { type: 'ElectrifiedCellShocked', tx: tile.tx, ty: tile.ty, ticks, hullBp, withBit }
}

function atLeastZero(amount: BigStat): BigStat {
  return cmp(amount, ZERO_MONEY) < 0 ? ZERO_MONEY : amount
}
