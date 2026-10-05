/**
 * The `planet_entered` line of the planet a run starts on (#2 log sequence: `game_started`, then
 * `planet_entered` for planet 1). Travel logs its own arrival as a projected domain event; the
 * starting planet has no command that put the session there, so this line has no `cmd`.
 */
import { getRunLog } from '../logging/runLog'
import { planetEntryOf } from '../systems/authority/planetEntry'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { readAuthorityState } from './authorityLink'
import { runEventPlaceOf, useGameStore } from './gameStore'

export function recordStartingPlanetEntered(): void {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) return
  const stamp = { ...runEventPlaceOf(useGameStore.getState()), tick: state.tick }
  getRunLog().record(stamp, 'planet_entered', planetEntryOf(params))
}
