/**
 * `metadata.json` of a run (design doc section 24, decision #11 section 1): every version a
 * comparison or replay must match, the build, the seed and whether debug was enabled or used.
 */
import { ENERGY_QUANTA_PER_UNIT } from '../constants/balance'
import { AUTHORITY_PROTOCOL_VERSION } from '../systems/authority/authorityCommand'
import { GENERATOR_VERSION } from '../systems/generatorVersion'
import { NUMBER_FORMAT_VERSION } from '../systems/money'
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
>

export function createRunMetadata(facts: RunFacts): RunMetadata {
  return {
    ...facts,
    logSchemaVersion: LOG_SCHEMA_VERSION,
    numberFormatVersion: NUMBER_FORMAT_VERSION,
    generatorVersion: GENERATOR_VERSION,
    authorityProtocolVersion: AUTHORITY_PROTOCOL_VERSION,
    energyQuantaPerUnit: ENERGY_QUANTA_PER_UNIT,
  }
}
