/**
 * Placed containers (ticket 823, the TD's final ruling on #823, comment 6384924632, points 1-7):
 * one generic world object a player drops on a planet, `cache_crate` its first kind. Later stash,
 * depot and crew-storage kinds are data rows (`planet-kit.economy.json` `containers`), never new
 * object types.
 *
 * - **Keys.** A sparse map by the planet's stable id `s:p` (#790's `corePlanetKeyOf`), never by g,
 *   then by `containerId`: a per-planet counter the host advances, never random, so the same seed
 *   and inputs give the same ids.
 * - **Drop.** The whole hold moves in; a drop past the kind's cap per player per planet, or of an
 *   empty hold, is refused and costs nothing. Spending the carried item is the caller's.
 * - **Pickup.** Cargo moves back up to the hold's free room, highest first: core fragments, then
 *   ore tiers from the top. What does not fit stays; an emptied container is removed. Only the
 *   owner may pick up while `access` is `owner`; `crew` opens it to every player, a data flip.
 * - **Conservation.** Cargo is moved, never copied: hold plus containers keep their unit total.
 *   The hold's premium ledger counts move with it and back (ticket 844, `containerPremium.ts`).
 *
 * Pure: the planet key, the cap and the hold's capacity come in as arguments.
 */
import { cargoUnitsOf, EMPTY_CARGO, type Cargo } from '../../../systems/vehicle/vehicleState'
import type { TilePoint } from '../../../systems/world/tileGrid'
import {
  EMPTY_PREMIUM_LEDGER,
  type PremiumLedger,
} from '../../../systems/authority/premium/premiumLedger'
import { premiumFieldOf, premiumMovedWith } from './containerPremium'

export const CONTAINER_ACCESS = ['owner', 'crew'] as const
export type ContainerAccess = (typeof CONTAINER_ACCESS)[number]

export interface PlacedContainer {
  containerId: number
  kind: string
  ownerId: string
  access: ContainerAccess
  /** The cell it is anchored to; it never collides and nothing in the ground destroys it. */
  cell: TilePoint
  cargo: Cargo
  /**
   * The premium ledger's counts of `cargo`'s units (ticket 844), moved in with the hold and out
   * with a pickup; absent while there are none.
   */
  premium?: PremiumLedger
}

/** One planet's containers by `containerId` as decimal text, and the id the next drop takes. */
export interface PlanetContainers {
  nextContainerId: number
  byId: Readonly<Record<string, PlacedContainer>>
}

/** Every planet's containers by stable planet id `s:p`; a planet with none has no key. */
export type PlacedContainers = Readonly<Record<string, PlanetContainers>>

export const NO_PLACED_CONTAINERS: PlacedContainers = {}
const FIRST_CONTAINER_ID = 1

export interface ContainerDrop {
  planetKey: string
  kind: string
  ownerId: string
  access: ContainerAccess
  cell: TilePoint
  hold: Cargo
  /** The hold's premium ledger counts, moved in with it (empty for a scenario's container). */
  premium: PremiumLedger
  /** The kind's cap per player per planet. */
  cap: number
}

export type DropRefusal = 'empty_hold' | 'container_cap'

export type DropOutcome =
  | { isDropped: true; placed: PlacedContainers; container: PlacedContainer; hold: Cargo }
  | { isDropped: false; reason: DropRefusal }

export interface ContainerPickup {
  planetKey: string
  playerId: string
  containerId: number
  hold: Cargo
  /** The hold's capacity in units. */
  capacity: number
}

export type PickupRefusal = 'unknown_container' | 'not_allowed' | 'hold_full'

export type PickupOutcome =
  | {
      isPickedUp: true
      placed: PlacedContainers
      /** What moved into the hold. */
      moved: Cargo
      /** The premium ledger counts that moved with it, into the picker's ledger. */
      movedPremium: PremiumLedger
      hold: Cargo
      /** The container as it is left, or null when the pickup emptied and removed it. */
      left: PlacedContainer | null
    }
  | { isPickedUp: false; reason: PickupRefusal }

/** Why `drop` cannot apply, or null when it can. */
export function dropRefusalOf(placed: PlacedContainers, drop: ContainerDrop): DropRefusal | null {
  if (cargoUnitsOf(drop.hold) === 0) return 'empty_hold'
  if (placedCountOf(placed, drop.planetKey, drop.ownerId, drop.kind) >= drop.cap) {
    return 'container_cap'
  }
  return null
}

/** The hold moved into a new container at the drop's cell, or why it was refused. */
export function dropContainer(placed: PlacedContainers, drop: ContainerDrop): DropOutcome {
  const reason = dropRefusalOf(placed, drop)
  if (reason !== null) return { isDropped: false, reason }
  const container = containerOfDrop(planetContainersOf(placed, drop.planetKey), drop)
  return {
    isDropped: true,
    placed: withContainer(placed, drop.planetKey, container),
    container,
    hold: EMPTY_CARGO,
  }
}

/** Why `pickup` cannot apply, or null when it can. */
export function pickupRefusalOf(
  placed: PlacedContainers,
  pickup: ContainerPickup,
): PickupRefusal | null {
  const container = containerAt(placed, pickup.planetKey, pickup.containerId)
  if (container === null) return 'unknown_container'
  if (!canPickUp(container, pickup.playerId)) return 'not_allowed'
  if (freeRoomOf(pickup.hold, pickup.capacity) === 0) return 'hold_full'
  return null
}

/** The container's cargo moved into the hold up to its free room, or why it was refused. */
export function pickupContainer(placed: PlacedContainers, pickup: ContainerPickup): PickupOutcome {
  const reason = pickupRefusalOf(placed, pickup)
  if (reason !== null) return { isPickedUp: false, reason }
  const container = containerAt(placed, pickup.planetKey, pickup.containerId) as PlacedContainer
  const { taken, rest } = takeHighestFirst(
    container.cargo,
    freeRoomOf(pickup.hold, pickup.capacity),
  )
  const premium = premiumMovedWith(container.premium ?? EMPTY_PREMIUM_LEDGER, taken)
  const left = cargoUnitsOf(rest) === 0 ? null : containerLeftWith(container, rest, premium.left)
  return {
    isPickedUp: true,
    placed: withContainerLeft(placed, pickup.planetKey, container.containerId, left),
    moved: taken,
    movedPremium: premium.taken,
    hold: addedCargo(pickup.hold, taken),
    left,
  }
}

/** Whether `playerId` may open `container`: its owner always, anyone while it is crew's. */
export function canPickUp(container: PlacedContainer, playerId: string): boolean {
  return container.access === 'crew' || container.ownerId === playerId
}

/** The planet's containers in id order. */
export function containersOn(placed: PlacedContainers, planetKey: string): PlacedContainer[] {
  return Object.values(planetContainersOf(placed, planetKey).byId).sort(
    (a, b) => a.containerId - b.containerId,
  )
}

/**
 * The planet's containers a session shows: those whose owner is in it (point 7: a departed
 * owner's containers persist hidden and come back with them).
 */
export function shownContainersOn(
  placed: PlacedContainers,
  planetKey: string,
  presentPlayerIds: readonly string[],
): PlacedContainer[] {
  return containersOn(placed, planetKey).filter((c) => presentPlayerIds.includes(c.ownerId))
}

/** How many containers of `kind` `ownerId` has placed on the planet. */
export function placedCountOf(
  placed: PlacedContainers,
  planetKey: string,
  ownerId: string,
  kind: string,
): number {
  return containersOn(placed, planetKey).filter((c) => c.ownerId === ownerId && c.kind === kind)
    .length
}

/** The units held in every container on every planet: the conservation total beside the holds. */
export function containedUnitsOf(placed: PlacedContainers): number {
  return Object.values(placed)
    .flatMap((planet) => Object.values(planet.byId))
    .reduce((total, container) => total + cargoUnitsOf(container.cargo), 0)
}

export function containerAt(
  placed: PlacedContainers,
  planetKey: string,
  containerId: number,
): PlacedContainer | null {
  return planetContainersOf(placed, planetKey).byId[String(containerId)] ?? null
}

function planetContainersOf(placed: PlacedContainers, planetKey: string): PlanetContainers {
  return placed[planetKey] ?? { nextContainerId: FIRST_CONTAINER_ID, byId: {} }
}

function containerOfDrop(planet: PlanetContainers, drop: ContainerDrop): PlacedContainer {
  return {
    containerId: planet.nextContainerId,
    kind: drop.kind,
    ownerId: drop.ownerId,
    access: drop.access,
    cell: { tx: drop.cell.tx, ty: drop.cell.ty },
    cargo: drop.hold,
    ...premiumFieldOf(drop.premium),
  }
}

/** The container with what a pickup left of its cargo and its premium counts. */
function containerLeftWith(
  container: PlacedContainer,
  cargo: Cargo,
  premium: PremiumLedger,
): PlacedContainer {
  const { premium: _moved, ...rest } = container
  return { ...rest, cargo, ...premiumFieldOf(premium) }
}

function withContainer(
  placed: PlacedContainers,
  planetKey: string,
  container: PlacedContainer,
): PlacedContainers {
  const planet = planetContainersOf(placed, planetKey)
  return {
    ...placed,
    [planetKey]: {
      nextContainerId: container.containerId + 1,
      byId: { ...planet.byId, [String(container.containerId)]: container },
    },
  }
}

/** The planet with the container replaced by `left`, or removed when `left` is null. */
function withContainerLeft(
  placed: PlacedContainers,
  planetKey: string,
  containerId: number,
  left: PlacedContainer | null,
): PlacedContainers {
  const planet = planetContainersOf(placed, planetKey)
  const { [String(containerId)]: _taken, ...others } = planet.byId
  const byId = left === null ? others : { ...others, [String(containerId)]: left }
  return { ...placed, [planetKey]: { nextContainerId: planet.nextContainerId, byId } }
}

function freeRoomOf(hold: Cargo, capacity: number): number {
  return Math.max(0, capacity - cargoUnitsOf(hold))
}

/** Up to `room` units of `cargo`: core fragments first, then ore tiers from the highest down. */
function takeHighestFirst(cargo: Cargo, room: number): { taken: Cargo; rest: Cargo } {
  const fragments = Math.min(cargo.coreFragments, room)
  let left = room - fragments
  const taken: Record<string, number> = {}
  const rest: Record<string, number> = {}
  for (const tier of tiersHighestFirst(cargo)) {
    const units = Math.min(cargo.ore[tier], left)
    left -= units
    if (units > 0) taken[tier] = units
    if (cargo.ore[tier] > units) rest[tier] = cargo.ore[tier] - units
  }
  return {
    taken: { ore: taken, coreFragments: fragments },
    rest: { ore: rest, coreFragments: cargo.coreFragments - fragments },
  }
}

/** Tier keys are decimal integers without leading zeros, so the longer one is the higher. */
function tiersHighestFirst(cargo: Cargo): string[] {
  return Object.keys(cargo.ore).sort((a, b) => b.length - a.length || (b > a ? 1 : b < a ? -1 : 0))
}

function addedCargo(hold: Cargo, moved: Cargo): Cargo {
  const ore = { ...hold.ore }
  for (const [tier, units] of Object.entries(moved.ore)) ore[tier] = (ore[tier] ?? 0) + units
  return { ore, coreFragments: hold.coreFragments + moved.coreFragments }
}
