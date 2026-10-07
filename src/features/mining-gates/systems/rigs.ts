/**
 * The five extractors (#142 "The extraction rigs", #162's extractor rows): when each arrives, which
 * one a planet's signature asks for, what each costs and the `vehicle-item` row that makes it
 * ownable. Horizontal: five new verbs across the campaign, never more speed.
 *
 * - Rig `k` arrives on planet `5 + 7k` (P5, P12, P19, P26, P33), so none lands on a schedule gap.
 * - A signature asks for the newest rig on its planet. In endless (from P41), with `k = p - 41`,
 *   it asks for `rigs[(k + floor(k / 5)) mod 5]`, so the act cycle `k mod 5` meets every rig once
 *   in each 25 planets (#142 "Endless extractor cycle decided").
 * - Its price is 40 band-5 ore at its own planet through `bandOrePriceAt`, so the card shows one
 *   number (#162 section 4). Ownership is the kernel's loadout (`ownsItem`): a store buy or a
 *   grant, never a default (GD lock on #148).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { GATE_ROWS, type GateRows, type Rig } from './gateRows'

/** The planet rig `rig` arrives on: `first + every * k` for its place `k` in arrival order. */
export function availableFromPlanet(rig: Rig, rows: GateRows = GATE_ROWS): number {
  return rows.rigFirstPlanet + rows.rigEveryPlanets * rows.rigs.indexOf(rig)
}

/** Whether rig `rig` has arrived on planet `planetIndex`. */
export function isRigAvailableOn(rig: Rig, planetIndex: number, rows: GateRows = GATE_ROWS) {
  return planetIndex >= availableFromPlanet(rig, rows)
}

/** The rig that opens cells of a family's gate class, or null for `drill` and `dynamite`. */
export function rigOfGateClass(gateClass: string, rows: GateRows = GATE_ROWS): Rig | null {
  return rows.rigs.find((rig) => rig.gateClass === gateClass) ?? null
}

/** The rig a planet's signature asks for; null before the first rig arrives. */
export function signatureRigOf(planetIndex: number, rows: GateRows = GATE_ROWS): Rig | null {
  if (planetIndex >= rows.endlessCycleFromPlanet) return endlessSignatureRigOf(planetIndex, rows)
  return newestRigOn(planetIndex, rows)
}

/** The rig with the largest arrival planet at or before `planetIndex`. */
export function newestRigOn(planetIndex: number, rows: GateRows = GATE_ROWS): Rig | null {
  const arrived = rows.rigs.filter((rig) => isRigAvailableOn(rig, planetIndex, rows))
  return arrived.at(-1) ?? null
}

/** `rigs[(k + floor(k / 5)) mod 5]` with `k = p - 41`. */
export function endlessSignatureRigOf(planetIndex: number, rows: GateRows = GATE_ROWS): Rig {
  const k = planetIndex - rows.endlessCycleFromPlanet
  const shift = Math.floor(k / rows.endlessCycleEvery)
  return rows.rigs[(k + shift) % rows.rigs.length]
}

/** 40 band-5 ore at the rig's own planet, so catching up later costs less, never more. */
export function rigPriceOf(rig: Rig, rows: GateRows = GATE_ROWS): Money {
  const planet = availableFromPlanet(rig, rows)
  return bandOrePriceAt(rows.rigPrice, planet, planet)
}

/** Whether the player owns the rig: bought in the store or granted, never by default. */
export function ownsRig(state: AuthorityState, playerId: string, rigId: string): boolean {
  return ownsItem(state, playerId, rigId)
}

/** The rig's `vehicle-item` row: always mounted once owned, so it takes no loadout slot (#162). */
export function vehicleItemOfRig(rig: Rig): VehicleItem {
  return { id: rig.id, iconId: iconIdOfRig(rig), slots: [], attach: rig.attach }
}

/** `item-<id>` with dots and underscores as dashes (#158): `item-rig-acid-etcher`. */
export function iconIdOfRig(rig: Rig): string {
  return `item-${rig.id.replace(/[._]/g, '-')}`
}

export function rigNamed(rigId: string, rows: GateRows = GATE_ROWS): Rig | null {
  return rows.rigs.find((rig) => rig.id === rigId) ?? null
}
