/**
 * Stabiliser foam's permanent cure (ticket 368, piece iv of the #157 ground-strengthening seam; the
 * GD ruling and TD lock there, both Scalers signed off, and the GD ruling on #368): at the Mark that
 * masters foam, the cells a spray sets also cure for good. A cured cell is reinforced through the
 * kernel `groundReinforcement` registry (`curedFoam.ts`): it never refills, and a block whose open
 * cells are all cured never warns. Below that Mark foam only holds for its timed 600 ticks.
 *
 * - **A Mark, not a second item.** The cure rides on foam's own capped Mark ladder (the tree's
 *   non-drill curve, finite and asymptotic), so it costs what that Mark costs and adds no node,
 *   row or income-cap count.
 * - **Applied on the spray.** The spray checks ownership (`sprayFoam`) before it reaches here, and
 *   sets only cells with no gate, core or lava; the kernel guards stand before the provider too.
 * - **Priced in its own band.** Each newly cured cell is billed as one cell's length of standard
 *   first lining at the band where it sits (`casingLiningPrice`, `k_casing` ore units of that
 *   band), onto the vehicle's lining bill, which the Sell bay settles (#76 amendment), as the
 *   shoring shot's cells are (ticket 369). A cell already cured is free. Depth and sigma never
 *   scale the effect; only the band price moves with the cell.
 * - **Cutting removes it.** A cured cell that yields again (`TileDestroyed`) is no longer held, and
 *   travel or the debug planet commands drop every cured cell: another planet is another world.
 *
 * Hardness, the drill_tip gate and the swept span never read the cure: foam changes no cell.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { casingLiningPrice } from '../../../systems/economy/casingPrices'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import {
  add,
  div,
  fromSafeInteger,
  toCanonical,
  ZERO_MONEY,
  type BigStat,
  type Money,
} from '../../../systems/money'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { MM_PER_SAMPLE, SAMPLES_PER_TILE } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import {
  curedFoamOf,
  newCuredCellsOf,
  withCuredCellsAdded,
  withCuredCellsCut,
  withNoCuredFoam,
} from './curedFoam'
import { foamCuredOf } from './terrainEvents'

export const CURED_FOAM_GROUND_REACTION: AuthorityReaction = {
  id: 'terrain-tools.cured-foam-ground',
  react: (_before, after, events) => keepCuredFoamOnItsGround(after, events),
}

/** The events that put the session on another planet, whose world starts fresh. */
const PLANET_CHANGES: ReadonlySet<DomainEvent['type']> = new Set([
  'PlanetEntered',
  'PlanetChanged',
  'PlanetSeedChanged',
])

/** The spray's set cells cure for good, each new one billed at its own band. */
export function cureFoamOn(
  state: AuthorityState,
  playerId: string,
  cells: readonly TilePoint[],
): RuleEffect {
  const params = planetParamsOf(state.planet)
  const fresh = newCuredCellsOf(state, cells)
  if (params === null || fresh.length === 0) return unchanged(state)
  const price = curedCellsPrice(params, fresh)
  return {
    state: withCuredCellsAdded(withLiningBilled(state, playerId, price), fresh),
    events: [foamCuredOf({ playerId, cellsCured: fresh.length, price: toCanonical(price) })],
  }
}

/** The lining bill for curing `cells`, each at the band where it sits. */
export function curedCellsPrice(params: PlanetParams, cells: readonly TilePoint[]): Money {
  return cells.reduce<Money>((total, cell) => add(total, curedCellPrice(params, cell)), ZERO_MONEY)
}

function curedCellPrice(params: PlanetParams, cell: TilePoint): Money {
  const band = bandOfTile(params, cell.tx, cell.ty)
  return casingLiningPrice(params.planetIndex, band, cellLengthMetres())
}

function cellLengthMetres(): BigStat {
  return div(fromSafeInteger(SAMPLES_PER_TILE * MM_PER_SAMPLE), fromSafeInteger(MM_PER_METRE))
}

function withLiningBilled(state: AuthorityState, playerId: string, price: Money): AuthorityState {
  const vehicle = vehicleOf(state, playerId)
  return withVehicle(state, playerId, { ...vehicle, liningBill: add(vehicle.liningBill, price) })
}

function keepCuredFoamOnItsGround(
  state: AuthorityState,
  events: readonly DomainEvent[],
): RuleEffect {
  if (Object.keys(curedFoamOf(state)).length === 0) return unchanged(state)
  if (events.some((event) => PLANET_CHANGES.has(event.type))) {
    return unchanged(withNoCuredFoam(state))
  }
  return unchanged(withCutCellsDropped(state, cutTilesOf(events)))
}

function withCutCellsDropped(state: AuthorityState, cut: readonly TilePoint[]): AuthorityState {
  return cut.length === 0 ? state : withCuredCellsCut(state, cut)
}

function cutTilesOf(events: readonly DomainEvent[]): TilePoint[] {
  return events.flatMap((event) =>
    event.type === 'TileDestroyed' ? [{ tx: event.tx, ty: event.ty }] : [],
  )
}
