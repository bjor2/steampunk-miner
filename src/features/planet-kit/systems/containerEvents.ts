/**
 * The commands, domain events and rejection reasons the Cache Crate adds (feature-slices.md 3.15,
 * ticket 823; the TD's final ruling on #823, points 2 and 8), by augmentation, never by editing
 * the kernel's lists; and the event bodies its rules build.
 *
 * Each event names the planet by its stable id (s, p), the cell, the kind, the owner, the
 * container's id and the contents' value: the ore at the Sell bay's base unit price, the core
 * fragments at none (they are banked, never sold). The value is what the contents would fetch at
 * this g; a later sale prices them where and when it happens (point 7).
 */
import { oreSalePrice } from '../../../systems/economy/oreEconomy'
import { add, fromBigInt, mul, toCanonical, ZERO_MONEY, type Money } from '../../../systems/money'
import { cargoUnitsOf, type Cargo } from '../../../systems/vehicle/vehicleState'
import type { PlacedContainer } from './placedContainers'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    /** Move the whole hold into a new container of `kind` at the vehicle's cell. */
    'planet-kit.drop_container': { kind: string }
    /** Move a container's cargo on this planet back into the hold, up to its free room. */
    'planet-kit.pickup_container': { containerId: number }
    /**
     * A scenario's container: `ownerId`'s container of `kind` at a cell of this planet, holding
     * the given cargo (ore units per tier as decimal text), as if dropped there.
     */
    'debug.planet-kit.placeContainer': {
      kind: string
      ownerId: string
      tx: number
      ty: number
      ore: Readonly<Record<string, string>>
      coreFragments: number
    }
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'planet-kit.ContainerDropped': ContainerMoveBody & {
      /** What the container holds: unbounded, as the hold's counts are (ticket 849). */
      units: bigint
      value: string
    }
    'planet-kit.ContainerPickedUp': ContainerMoveBody & {
      /** What moved into the hold. */
      units: bigint
      value: string
      /** What stays in the container; 0 when the pickup emptied and removed it. */
      unitsLeft: bigint
    }
  }
  interface RejectionReasons {
    'planet-kit.unknown_kind': true
    'planet-kit.empty_hold': true
    'planet-kit.container_cap': true
    'planet-kit.unknown_container': true
    'planet-kit.not_allowed': true
    'planet-kit.hold_full': true
    'planet-kit.out_of_reach': true
    'planet-kit.bad_cargo': true
  }
}

/** The fields both container events carry. */
export interface ContainerMoveBody {
  playerId: string
  /** The planet's stable id (s, p): its system and its place in it, as canonical index text. */
  system: string
  place: string
  containerId: number
  kind: string
  ownerId: string
  tx: number
  ty: number
}

export function containerDroppedOf(
  playerId: string,
  planetKey: string,
  container: PlacedContainer,
) {
  return {
    type: 'planet-kit.ContainerDropped' as const,
    ...moveBodyOf(playerId, planetKey, container),
    units: cargoUnitsOf(container.cargo),
    value: toCanonical(contentsValueOf(container.cargo)),
  }
}

export function containerPickedUpOf(
  playerId: string,
  planetKey: string,
  container: PlacedContainer,
  moved: Cargo,
) {
  return {
    type: 'planet-kit.ContainerPickedUp' as const,
    ...moveBodyOf(playerId, planetKey, container),
    units: cargoUnitsOf(moved),
    value: toCanonical(contentsValueOf(moved)),
    unitsLeft: cargoUnitsOf(container.cargo) - cargoUnitsOf(moved),
  }
}

/** The ore's worth at the Sell bay's base unit price of each tier; core fragments are never sold. */
export function contentsValueOf(cargo: Cargo): Money {
  return Object.entries(cargo.ore).reduce(
    (total, [tier, units]) =>
      add(total, mul(oreSalePrice(Number.parseInt(tier, 10)), fromBigInt(units))),
    ZERO_MONEY,
  )
}

function moveBodyOf(
  playerId: string,
  planetKey: string,
  container: PlacedContainer,
): ContainerMoveBody {
  const [system, place] = planetKey.split(':')
  return {
    playerId,
    system,
    place,
    containerId: container.containerId,
    kind: container.kind,
    ownerId: container.ownerId,
    tx: container.cell.tx,
    ty: container.cell.ty,
  }
}
