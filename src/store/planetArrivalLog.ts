/**
 * The lines of the planet a run starts on (`planet_entered`, then `artefact_cache_spawned`);
 * travel logs its own arrival as projected domain events.
 */
import { getRunLog } from '../logging/runLog'
import { recordStartingPlanet } from '../logging/startingPlanetLines'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { readAuthorityState } from './authorityLink'
import { runEventPlaceOf, useGameStore } from './gameStore'

export function recordStartingPlanetEntered(): void {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) return
  const stamp = { ...runEventPlaceOf(useGameStore.getState()), tick: state.tick }
  recordStartingPlanet(getRunLog(), stamp, params)
}
