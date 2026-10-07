/**
 * What the popup hears (#178 TD settlement): a unit reaching the local player's hold
 * (`CargoAdded`, the drill's or a blast's) is a chip pickup, and the codex's first mine of a type
 * (`codex.OreDiscovered`) is a plaque line. A teammate's events never show here (#172 §4). Reads
 * the authority state the events answered; writes nothing.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import type { OrePickup } from './chipBoard'
import { oreFaceOf, type OreFace } from './oreFace'
import type { NewMaterial } from './plaqueBoard'
import { awayDirectionOf, motionOfPose } from './render/chipPlacement'
import { unitPriceTextOf } from './unitPrice'

type CargoAdded = Extract<DomainEvent, { type: 'CargoAdded' }>
type OreDiscovered = Extract<DomainEvent, { type: 'codex.OreDiscovered' }>

export interface MaterialMoment {
  material: NewMaterial
  tick: number
}

/** The local player's units into the hold, as chip pickups. */
export function pickupsOf(
  events: readonly DomainEvent[],
  state: AuthorityState,
  playerId: string,
): OrePickup[] {
  return events.filter(isCargoAdded).flatMap((added) => {
    const face = localFaceOf(added, state, playerId)
    return face === null ? [] : [pickupOf(added, face, state, playerId)]
  })
}

/** The local player's first mines of a type, as plaque lines. */
export function materialMomentsOf(
  events: readonly DomainEvent[],
  state: AuthorityState,
  playerId: string,
): MaterialMoment[] {
  return events.filter(isOreDiscovered).flatMap((discovered) => {
    const face = localFaceOf(discovered, state, playerId)
    return face === null ? [] : [momentOf(discovered, face, state, playerId)]
  })
}

function pickupOf(
  added: CargoAdded,
  face: OreFace,
  state: AuthorityState,
  playerId: string,
): OrePickup {
  const vehicle = vehicleOf(state, playerId)
  const motion = motionOfPose(vehicle.pose, statsOfVehicle(vehicle).engine.speedMax)
  return {
    face,
    amount: added.amount,
    tick: added.tick,
    planetIndex: state.planet.index,
    away: awayDirectionOf(motion),
  }
}

function momentOf(
  discovered: OreDiscovered,
  face: OreFace,
  state: AuthorityState,
  playerId: string,
): MaterialMoment {
  const unitPriceText = unitPriceTextOf(state, playerId, discovered.tier)
  return { material: { face, unitPriceText }, tick: discovered.tick }
}

function localFaceOf(
  event: CargoAdded | OreDiscovered,
  state: AuthorityState,
  playerId: string,
): OreFace | null {
  if (event.playerId !== playerId) return null
  return oreFaceOf(event.oreId, planetParamsOf(state.planet))
}

function isCargoAdded(event: DomainEvent): event is CargoAdded {
  return event.type === 'CargoAdded'
}

function isOreDiscovered(event: DomainEvent): event is OreDiscovered {
  return event.type === 'codex.OreDiscovered'
}
