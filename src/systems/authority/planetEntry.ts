/**
 * Moving the session onto another planet (decisions #10 and #4): another planet is another world.
 * Its deltas start empty, its core progress starts fresh, and every vehicle stands on its dock
 * site. The vehicles keep their levels, energy, hull and cargo; the platform keeps its bay and look.
 * `Travel` and `debug.setPlanet` both go through here.
 */
import { GENERATOR_VERSION } from '../generatorVersion'
import { dockedPoseAt } from '../vehicle/vehiclePose'
import type { PlanetParams } from '../world/planetParams'
import { EMPTY_WORLD } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import { NEW_CORE_PROGRESS } from './coreProgress'
import type { DomainEventBodies } from './domainEvent'
import { dockSiteOfPlanet, type SessionPlanet } from './planetOfState'

export function withSessionOnPlanet(state: AuthorityState, planet: SessionPlanet): AuthorityState {
  const site = dockSiteOfPlanet(planet)
  const pose = site === null ? null : dockedPoseAt(site)
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      { ...player, vehicle: { ...player.vehicle, pose } },
    ]),
  )
  return { ...state, planet, world: EMPTY_WORLD, core: NEW_CORE_PROGRESS, players }
}

/** What `planet_entered` says about a planet (#11: its seed, generator and radius). */
export function planetEntryOf(params: PlanetParams): DomainEventBodies['PlanetEntered'] {
  return {
    planetSeed: params.planetSeed,
    generatorVersion: GENERATOR_VERSION,
    radius: params.radiusTiles,
  }
}
