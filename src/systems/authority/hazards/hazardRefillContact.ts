/**
 * A `refill` contact (ticket 848; rockfall, ticket 651): the cut cell fills again by the row's
 * refill share (`world/hazardRefill.ts`, farthest from the rig first, never burying a rig), and
 * the rubble crushes the rig for the row's hull share from the arc the cell lies in
 * (`hazardHits.ts`), both scaled by the contact's factor. A refill that filled nothing crushes
 * nothing. The ground changes as ordinary `GroundChanged`, and `HazardRefilled` logs the contact as
 * `hazard_refill`.
 */
import { scaledByFactor } from '../../registries/contactEffects'
import type { VehicleState } from '../../vehicle/vehicleState'
import type { BodyCentre } from '../../world/collapseRefill'
import { refillCutCell } from '../../world/hazardRefill'
import type { PlanetParams } from '../../world/planetParams'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { chainEffects, type RuleEffect } from '../commandRule'
import { vehicleBodiesOf } from '../collapse/collapseWatch'
import { groundChangedEventsOf } from '../groundChangedEvents'
import type { CellContact } from './cellContact'
import { takeHazardHit, wreckIfHullGone } from './hazardHits'

export function refillOnContact(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  { tile, row, factorBp }: CellContact<'refill'>,
): RuleEffect {
  const refilled = refillCutCell(state.world, params, {
    tile,
    shareBp: scaledByFactor(row.refillShareBp, factorBp),
    cutter: bodyOf(vehicleOf(state, playerId)),
    bodies: vehicleBodiesOf(state).map(({ centre }) => centre),
  })
  const shareBp = refilled.filled === 0 ? 0 : scaledByFactor(row.hullShareBp, factorBp)
  const crushed = takeHazardHit({ ...state, world: refilled.world }, playerId, params, tile, {
    shareBp,
    diveHullCapBp: row.diveHullCapBp,
  })
  const refill = {
    type: 'HazardRefilled' as const,
    kind: row.kind,
    ...tile,
    samples: refilled.filled,
    ...crushed.hit,
  }
  return chainEffects(crushed.state, [
    (current) => ({ state: current, events: [...groundChangedEventsOf(refilled), refill] }),
    (current) => wreckIfHullGone(current, playerId, row.kind),
  ])
}

function bodyOf(vehicle: VehicleState): BodyCentre | null {
  return vehicle.pose === null ? null : { xMm: vehicle.pose.x, yMm: vehicle.pose.y }
}
