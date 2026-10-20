/**
 * What the popup hears (#178 TD settlement): a unit reaching the local player's hold
 * (`CargoAdded`, the drill's or a blast's) is a chip pickup, the drill's once its cell is carved
 * (ticket 615), and the codex's first mine of a type
 * (`codex.OreDiscovered`) is a plaque line. A teammate's events never show here (#172 §4). Each
 * carries its unit's rarity once the material is seen (ticket 454, `findRarity.ts`); the plaque's
 * is the first unit of its type in the batch. Reads the authority state the events answered;
 * writes nothing.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { withoutCarvingPickups, type CarvedCell } from '../../../systems/materialPop/carveWatch'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { statsOfVehicle } from '../../../systems/vehicle/vehicleState'
import type { SeenRarity } from '../../../systems/render/seenRarity'
import type { OrePickup } from './chipBoard'
import { findRarityOf } from './findRarity'
import { oreFaceOf, type OreFace } from './oreFace'
import type { NewMaterial } from './plaqueBoard'
import { awayDirectionOf, motionOfPose, type VehicleMotion } from './render/chipPlacement'
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
  return events.flatMap((event, at) =>
    isCargoAdded(event) ? localPickupsOf(events, at, event, state, playerId) : [],
  )
}

/**
 * The batch's pickups but the drill's: a drilled cell's unit shows once its cell is carved
 * (ticket 615), so only a blast's or a bore's units show as they reach the hold.
 */
export function uncarvedPickupsOf(
  events: readonly DomainEvent[],
  state: AuthorityState,
  playerId: string,
): OrePickup[] {
  return pickupsOf(withoutCarvingPickups(events, playerId), state, playerId)
}

/** The drilled cells' units, each at the tick its cell was carved (G&V on #442: within 1 tick). */
export function carvedPickupsOf(
  cells: readonly CarvedCell[],
  state: AuthorityState,
  playerId: string,
): OrePickup[] {
  return cells.flatMap((cell) =>
    pickupsOf(cell.yieldEvents, state, playerId).map((pickup) => ({ ...pickup, tick: cell.tick })),
  )
}

/** The local player's first mines of a type, as plaque lines. */
export function materialMomentsOf(
  events: readonly DomainEvent[],
  state: AuthorityState,
  playerId: string,
): MaterialMoment[] {
  const pickups = pickupsOf(events, state, playerId)
  return events.filter(isOreDiscovered).flatMap((discovered) => {
    const face = localFaceOf(discovered, state, playerId)
    if (face === null) return []
    return [momentOf(discovered, face, firstRarityOf(pickups, face.oreId), state, playerId)]
  })
}

/** The unit `events[at]` brought into the local player's hold, or none for a teammate's. */
function localPickupsOf(
  events: readonly DomainEvent[],
  at: number,
  added: CargoAdded,
  state: AuthorityState,
  playerId: string,
): OrePickup[] {
  const face = localFaceOf(added, state, playerId)
  if (face === null) return []
  return [pickupOf(added, face, findRarityOf(events, at, state, playerId), state, playerId)]
}

function pickupOf(
  added: CargoAdded,
  face: OreFace,
  rarity: SeenRarity | null,
  state: AuthorityState,
  playerId: string,
): OrePickup {
  return {
    face,
    amount: added.amount,
    tick: added.tick,
    planetIndex: state.planet.index,
    away: awayDirectionOf(localMotionOf(state, playerId)),
    rarity,
  }
}

function firstRarityOf(pickups: readonly OrePickup[], oreId: string): SeenRarity | null {
  return pickups.find((pickup) => pickup.face.oreId === oreId)?.rarity ?? null
}

/** The player's vehicle as last reported, against how fast it drives. */
export function localMotionOf(state: AuthorityState, playerId: string): VehicleMotion {
  const vehicle = vehicleOf(state, playerId)
  return motionOfPose(vehicle.pose, statsOfVehicle(vehicle).engine.speedMax)
}

function momentOf(
  discovered: OreDiscovered,
  face: OreFace,
  rarity: SeenRarity | null,
  state: AuthorityState,
  playerId: string,
): MaterialMoment {
  const unitPriceText = unitPriceTextOf(state, playerId, discovered.tier)
  return { material: { face, unitPriceText, rarity }, tick: discovered.tick }
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
