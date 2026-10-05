/**
 * The lines of the planet a run starts on (#2 log sequence: `game_started`, then `planet_entered`
 * for planet 1, then its `artefact_cache_spawned`, #46). Travel logs the same pair for a later
 * planet as projected domain events; the starting planet has no command that put the session
 * there, so these lines have no `cmd`. The live store and the pacing bot both call this.
 */
import { artefactCacheSpawnOf, planetEntryOf } from '../systems/authority/planetEntry'
import type { PlanetParams } from '../systems/world/planetParams'
import type { RunEventStamp } from './runEvent'
import type { RunLog } from './runLog'

export function recordStartingPlanet(
  runLog: RunLog,
  stamp: RunEventStamp,
  params: PlanetParams,
): void {
  runLog.record(stamp, 'planet_entered', planetEntryOf(params))
  runLog.record(stamp, 'artefact_cache_spawned', artefactCacheSpawnOf(params))
}
