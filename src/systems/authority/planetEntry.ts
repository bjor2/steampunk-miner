/**
 * Moving the session onto another planet (decisions #10 and #4): another planet is another world.
 * Its deltas start empty, its core progress, enemies, collapses, lava, bores, struts and grounded
 * lines start fresh, and every vehicle stands on its dock site, its drill's gated bite over (ticket
 * 519) and its report cut's carry dropped (ticket 535). An item on auto stays on, its preview
 * dropped (ticket 317). The vehicles keep their levels, energy, hull and cargo; the platform keeps
 * its look, and its core bay becomes the new planet's own (ticket 790, `planetCoreBays.ts`), the
 * left planet's bay stowed under that planet and a core completed there before landing completed.
 * A charge still on a wall stays on the old planet's wall: it is gone, and the rack keeps the rest.
 * `Travel`, the star map's jump (ticket 755) and `debug.setPlanet` all go through here; the planet
 * keeps the star-map system it is moved to.
 *
 * The planet is entered under this build's ore rules (ticket 445): the stamp is set here from the
 * index, never carried over, so a legacy planet loaded from a save never passes its missing stamp on
 * to the next planet. `planet_entered` names the rules when the planet has them, so a report can
 * rebuild the exact params.
 */
import { GENERATOR_VERSION } from '../generatorVersion'
import type { VehicleCharges } from '../vehicle/vehicleCharges'
import { withoutCutCarry } from '../vehicle/cutCarry'
import { withoutGatedBite } from '../vehicle/gatedBite'
import { dockedPoseAt } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import { artefactCacheTile } from '../world/artefactCache'
import type { PlanetParams } from '../world/planetParams'
import { EMPTY_WORLD } from '../world/worldState'
import type { AuthorityState } from './authorityState'
import { NO_COLLAPSE } from './collapse/collapseState'
import { NO_LOOSE_LAVA } from './lava/lavaState'
import { NO_LIVE_BLASTS } from './charges/liveBlast'
import { NO_TERRAIN_EDITS } from './terrain/terrainEdits'
import { NO_BORES, withBores } from './bore/boreState'
import { NO_STRUTS, withStruts } from './bore/strutState'
import { NO_GROUNDED_LINES, withGroundedLines } from './magnetic/groundedLines'
import { playerOnNewPlanet } from './autoMode/autoModeState'
import { combatOnNewPlanet } from './combat/enemyRoster'
import type { DomainEventBodies } from './domainEvent'
import { coreBaysOnLanding } from './planetCoreBays'
import {
  dockSiteOfPlanet,
  enteredPlanetOf,
  systemOfPlanet,
  withSystem,
  type SessionPlanet,
} from './planetOfState'

export function withSessionOnPlanet(state: AuthorityState, to: SessionPlanet): AuthorityState {
  const planet = withSystem(enteredPlanetOf(to.index, to.seed), systemOfPlanet(to))
  const site = dockSiteOfPlanet(planet)
  const pose = site === null ? null : dockedPoseAt(site)
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      {
        ...playerOnNewPlanet(player),
        vehicle: {
          ...withoutCutCarry(withoutGatedBite(player.vehicle)),
          pose,
          charges: withoutPlanted(player.vehicle),
        },
      },
    ]),
  )
  return {
    ...withGroundedLines(withStruts(withBores(state, NO_BORES), NO_STRUTS), NO_GROUNDED_LINES),
    ...coreBaysOnLanding(state, planet),
    planet,
    world: EMPTY_WORLD,
    combat: combatOnNewPlanet(state.combat),
    collapse: NO_COLLAPSE,
    lava: NO_LOOSE_LAVA,
    liveBlasts: NO_LIVE_BLASTS,
    terrainEdits: NO_TERRAIN_EDITS,
    players,
  }
}

function withoutPlanted(vehicle: VehicleState): VehicleCharges {
  return { ...vehicle.charges, planted: null }
}

/** What `planet_entered` says about a planet (#11: its seed, generator and radius). */
export function planetEntryOf(params: PlanetParams): DomainEventBodies['PlanetEntered'] {
  return {
    planetSeed: params.planetSeed,
    generatorVersion: GENERATOR_VERSION,
    radius: params.radiusTiles,
    ...(params.oreRulesVersion === undefined ? {} : { oreRulesVersion: params.oreRulesVersion }),
  }
}

/** What `artefact_cache_spawned` says about a planet's cache (#46): its tile and band. */
export function artefactCacheSpawnOf(
  params: PlanetParams,
): DomainEventBodies['ArtefactCacheSpawned'] {
  return { ...artefactCacheTile(params), band: params.artefactCacheBand }
}
