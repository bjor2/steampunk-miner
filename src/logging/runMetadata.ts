/**
 * `metadata.json` of a run (design doc section 24, decision #11 section 1): every version a
 * comparison or replay must match, the build, the seed and whether debug was enabled or used,
 * and whether the seed's planet 1 needed the dock-guaranteed ore patch (#42). A run whose session
 * had dev flags set says so (ticket 547): `flagsDelta` while any flag is off its default and
 * `devFlagsEverSet` from the first `debug.setFlags`, both absent until then, so no gate reads a
 * tainted run as evidence (`devFlagReport.ts`). `flagsDelta` names the client loop's flags beside
 * the authority's (ticket 548); a client flag set also sends a `debug.setFlags`, so it marks too.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../constants/balance'
import { AUTHORITY_PROTOCOL_VERSION } from '../systems/authority/authorityCommand'
import { GENERATOR_VERSION } from '../systems/generatorVersion'
import { NUMBER_FORMAT_VERSION } from '../systems/money'
import type { DevFlags } from '../constants/devFlags'
import {
  devFlagFieldsOf,
  isAuthorityFlagId,
  type CarriesDevFlags,
  type DevFlagDelta,
} from '../systems/authority/devFlagState'
import { runFlagDeltaOf } from '../systems/devFlags/devFlagChoice'
import type { DevFlagChoice } from '../systems/devFlags/devFlagOverrides'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { dockGuaranteeCount } from '../systems/world/dockGuarantee'
import { LOG_SCHEMA_VERSION } from './runEvent'

export interface RunMetadata {
  runId: string
  logSchemaVersion: number
  numberFormatVersion: number
  generatorVersion: number
  authorityProtocolVersion: number
  energyQuantaPerUnit: number
  gameVersion: string
  buildCommit: string
  worldSeed: number
  platform: 'electron' | 'browser'
  /** The debug API was available in this run. */
  debugEnabled: boolean
  /** At least one `debug.*` command was accepted (#11 section 4); never reset within a run. */
  debugApplied: boolean
  players: number
  /**
   * The dev flags off their shipped defaults, the authority's (ticket 547) and the client loop's
   * (ticket 548); absent while none is.
   */
  flagsDelta?: DevFlagChoice
  /** A `debug.setFlags` was accepted in the session, even if flipped back (ticket 547). */
  devFlagsEverSet?: true
  /** #42 `patch_dock_guaranteed`: 1 when planet 1 of this seed got the dock patch, else 0. */
  patchDockGuaranteed: number
  /** ISO 8601, UTC. */
  startTime: string
  /** ISO 8601, UTC; null while the run is in progress. */
  endTime: string | null
}

/** What the run supplies; the versions come from the code that defines them. */
export type RunFacts = Omit<
  RunMetadata,
  | 'logSchemaVersion'
  | 'numberFormatVersion'
  | 'generatorVersion'
  | 'authorityProtocolVersion'
  | 'energyQuantaPerUnit'
  | 'patchDockGuaranteed'
>

export function createRunMetadata(facts: RunFacts): RunMetadata {
  return {
    ...facts,
    logSchemaVersion: LOG_SCHEMA_VERSION,
    numberFormatVersion: NUMBER_FORMAT_VERSION,
    generatorVersion: GENERATOR_VERSION,
    authorityProtocolVersion: AUTHORITY_PROTOCOL_VERSION,
    energyQuantaPerUnit: ENERGY_QUANTA_PER_UNIT,
    patchDockGuaranteed: dockGuaranteeOfSeed(facts.worldSeed),
  }
}

/** Planet 1 of the run's world seed; a seed no planet can be made from has no patch. */
function dockGuaranteeOfSeed(worldSeed: number): number {
  const params = planetParamsOf({ index: 1, seed: worldSeed })
  return params === null ? 0 : dockGuaranteeCount(params)
}

/**
 * The header's dev flag fields from the session's state and the client loop's flags: each absent
 * while unset (tickets 547, 548).
 */
export function runFlagFieldsOf(
  state: CarriesDevFlags,
  client: DevFlags,
): Pick<RunMetadata, 'flagsDelta' | 'devFlagsEverSet'> {
  const delta = runFlagDeltaOf(state, client)
  const { devFlagsEverSet } = devFlagFieldsOf(state)
  return {
    ...(Object.keys(delta).length === 0 ? {} : { flagsDelta: delta }),
    ...(devFlagsEverSet === undefined ? {} : { devFlagsEverSet }),
  }
}

/**
 * The header's dev flag fields read back as a session carries them, for the taint checks. A
 * client flag in the delta marks the run on its own, whatever the header's marker says.
 */
export function devFlagsOfRun(metadata: Partial<RunMetadata>): CarriesDevFlags {
  const delta = metadata.flagsDelta ?? {}
  const isMarked = metadata.devFlagsEverSet === true || hasClientEntry(delta)
  return devFlagFieldsOf({
    devFlagDelta: authorityDeltaOfRun(delta),
    devFlagsEverSet: isMarked ? true : undefined,
  })
}

function authorityDeltaOfRun(delta: DevFlagChoice): DevFlagDelta {
  return Object.fromEntries(Object.entries(delta).filter(([id]) => isAuthorityFlagId(id)))
}

function hasClientEntry(delta: DevFlagChoice): boolean {
  return Object.keys(delta).some((id) => !isAuthorityFlagId(id))
}
