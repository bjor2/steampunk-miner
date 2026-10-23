/**
 * `JumpToPlanet {system, planet}` (ticket 755, the GD lock on #650): the star map's jump, decided
 * by the host. A client only sends the request; the authority checks the dock, the destination and
 * the fuel, and charges the fuel, so every client of the session hears one answer in the same
 * events (#3). Any planet of the session's system is open: the only gate is the fuel the jump burns
 * (`economy/jumpFuel.ts`), never core fragments or `Travel`'s next-planet rule. Both indexes cross
 * JSON as canonical decimal text (ticket 754).
 *
 * Refused, in this order: `no_planet` when the session has no world, `not_docked`, `other_system`
 * for another system (the jump between systems is ticket 759), `no_planet` for a destination with
 * no safe-integer index, `same_planet`, and `fuel_short` when the requesting vehicle's tank holds
 * less than the jump burns. A refused jump changes nothing.
 *
 * Accepted, it is as instant as `Travel` (#10): the requesting vehicle's tank pays the fuel, no money
 * and no fragment leaves, and the whole session moves to the destination's dock site. It logs
 * `travel_started` with `fuelSpent` (cost 0, coreSpent 0), `planet_unlocked` when the jump goes to
 * a later planet, the schedule rows the move opens (#88), `planet_entered`,
 * `artefact_cache_spawned` and a `travel` digest.
 */
import { jumpFuelUnitsOf } from '../../economy/jumpFuel'
import { sub, toCanonical, ZERO_MONEY, type BigStat } from '../../money'
import { planetIndexAt } from '../../starMap/campaignIndex'
import { readIndexText } from '../../starMap/planetAddress'
import { fuelOf, hasFuelFor, withFuel } from '../../vehicle/vehicleFuel'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { notDockedRejection } from '../dockRules'
import { noPlanetRejection, systemOfPlanet, type SessionPlanet } from '../planetOfState'
import { digestAtTravel, enterPlanetByTravel } from '../travelRules'

/** A jump's destination as the payload names it, both indexes read from their text. */
export interface JumpTarget {
  system: bigint
  planet: bigint
}

export const JUMP_RULES: { readonly jumpToPlanet: CommandRule<'jumpToPlanet'> } = {
  jumpToPlanet: {
    fields: { system: 'indexText', planet: 'indexText' },
    reject: (state, { playerId, payload }) =>
      jumpRefusal(state, playerId, jumpTargetOf(payload.system, payload.planet)),
    apply: (state, { playerId, payload }) =>
      jump(state, playerId, destinationOf(state, jumpTargetOf(payload.system, payload.planet))),
  },
}

/** The payload's indexes; the `indexText` field checks ran before any rule reads them. */
export function jumpTargetOf(system: string, planet: string): JumpTarget {
  return { system: readIndexText(system) ?? 0n, planet: readIndexText(planet) ?? 0n }
}

/** Why a jump to `target` would be refused now; null when it would go (the star map's dimming). */
export function jumpRefusal(
  state: AuthorityState,
  playerId: string,
  target: JumpTarget,
): Rejection | null {
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => notDockedRejection(vehicleOf(state, playerId)),
    () => otherSystemRejection(state, target),
    () => unreachablePlanetRejection(target),
    () => samePlanetRejection(state, target),
    () => fuelShortRejection(state, playerId, target),
  ])
}

/** The fuel a jump from the session's planet to `target` burns; call only once it is reachable. */
export function jumpFuelTo(state: AuthorityState, target: JumpTarget): BigStat {
  const toPlanet = planetIndexAt(target.system, target.planet)
  return toPlanet === null ? ZERO_MONEY : jumpFuelUnitsOf(state.planet.index, toPlanet)
}

function otherSystemRejection(state: AuthorityState, target: JumpTarget): Rejection | null {
  const system = systemOfPlanet(state.planet)
  if (target.system === system) return null
  return rejectionOf(
    'other_system',
    `the session is in system ${system}; jumps to system ${target.system} need the jump drive`,
  )
}

function unreachablePlanetRejection(target: JumpTarget): Rejection | null {
  if (planetIndexAt(target.system, target.planet) !== null) return null
  return rejectionOf('no_planet', `planet ${target.planet} has no safe-integer planet index`)
}

function samePlanetRejection(state: AuthorityState, target: JumpTarget): Rejection | null {
  if (planetIndexAt(target.system, target.planet) !== state.planet.index) return null
  return rejectionOf('same_planet', `the session is on planet ${target.planet} already`)
}

function fuelShortRejection(
  state: AuthorityState,
  playerId: string,
  target: JumpTarget,
): Rejection | null {
  const needed = jumpFuelTo(state, target)
  const vehicle = vehicleOf(state, playerId)
  if (hasFuelFor(vehicle, needed)) return null
  const held = toCanonical(fuelOf(vehicle))
  return rejectionOf('fuel_short', `needs ${toCanonical(needed)} fuel, the tank holds ${held}`)
}

/** The destination as a session planet: the same world seed, system and place in it. */
function destinationOf(state: AuthorityState, target: JumpTarget): SessionPlanet {
  return { ...state.planet, index: planetIndexAt(target.system, target.planet) ?? 0 }
}

function jump(state: AuthorityState, playerId: string, to: SessionPlanet): RuleEffect {
  return chainEffects(state, [
    (current) => burnJumpFuel(current, playerId, to),
    (current) => enterPlanetByTravel(current, to, unlockedByJump(current.planet, to)),
    (current) => digestAtTravel(current),
  ])
}

/** The jump's fuel from the requesting vehicle's tank, said once in `travel_started`. */
function burnJumpFuel(state: AuthorityState, playerId: string, to: SessionPlanet): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const burnt = jumpFuelUnitsOf(state.planet.index, to.index)
  return {
    state: withVehicle(state, playerId, withFuel(vehicle, sub(fuelOf(vehicle), burnt))),
    events: [
      {
        type: 'TravelStarted',
        fromPlanet: state.planet.index,
        toPlanet: to.index,
        cost: toCanonical(ZERO_MONEY),
        coreSpent: 0,
        fuelSpent: toCanonical(burnt),
      },
    ],
  }
}

/** Reaching a later planet unlocks it (#2 log sequence); a jump back unlocks nothing. */
function unlockedByJump(from: SessionPlanet, to: SessionPlanet): DomainEventBody[] {
  return to.index > from.index ? [{ type: 'PlanetUnlocked', planetIndex: to.index }] : []
}
