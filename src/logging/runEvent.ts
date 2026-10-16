/**
 * One line of a run's event log: the versioned envelope of decision #11 section 1.
 *
 *   {"v":1,"seq":412,"tick":8120,"timestamp":135.4,"runId":"run_…","playerId":"p1","planet":1,
 *    "depthTiles":73,"event":"resource_sold","cmd":[8118,3],"data":{…}}
 *
 * `tick` (the authority's fixed 1/60 s step) is the only clock analysis and replay use;
 * `timestamp` is wall seconds since start, for humans only, and never enters a digest, summary or
 * comparison. `seq` is strictly increasing per run. The planet seed lives on `planet_entered`.
 */
import type { RunEventData, RunEventName } from './eventNames'

/**
 * Bump when a field is renamed, removed, retyped or changes meaning (#11 section 1).
 * 2: `casing_lined` lost `paid`, as lining is paid at the Sell bay (`lining_settled`, #115).
 * 3: `charge_detonated` keeps only `tx, ty`: a blast's totals moved to its `blast_resolved` line,
 *    and its tiles log no `tile_destroyed` lines (K6, #189).
 * 4: `resource_sold` gains the required `coinsShown`, the sell burst's coin count (ticket 220).
 * 5: `commands.ndjson` writes a `reportPose`'s `drive` only when it changed since that player's
 *    previous logged report; a reader carries the last one forward (`commandLog.ts`, ticket 342).
 * 6: a drill span logs one `drill_cut` line (its fields retyped) and one `casing_lined` line per
 *    lining run in place of its per-cell lines (`drillCutLine.ts`), and `commands.ndjson` leaves
 *    out every unchanged pose field and writes a run of drill commands as one line (ticket 420).
 * 7: `commands.ndjson` writes a player's reports a tick and a seq apart that only move as one line
 *    with a `poseRun` of integer residuals (`poseRunLine.ts`, ticket 522). Events are unchanged.
 */
export const LOG_SCHEMA_VERSION = 7

/**
 * The oldest schema whose `events.ndjson` reads as this one's: 7 changed `commands.ndjson` only, so
 * a schema 6 run's events and summary still compare with today's (ticket 522).
 */
const OLDEST_SAME_EVENTS_SCHEMA_VERSION = 6

/** Whether a run logged under schema `version` has events, and a summary, that read as today's. */
export function hasTodaysEventLines(version: number): boolean {
  return version >= OLDEST_SAME_EVENTS_SCHEMA_VERSION && version <= LOG_SCHEMA_VERSION
}

/** Where the player is: the store supplies it, the log stamps it. */
export interface RunEventPlace {
  playerId: string
  /** Integer planet index (#4). */
  planet: number
  /** Whole tiles below the surface. */
  depthTiles: number
}

/** `[tick, seq]` of the authority command that caused an event. */
export type CommandRef = readonly [tick: number, seq: number]

/** Everything the caller gives the log besides the event; absent `cmd` means tick-driven. */
export interface RunEventStamp extends RunEventPlace {
  tick: number
  cmd?: CommandRef
}

export interface RunEvent<N extends RunEventName = RunEventName> extends RunEventStamp {
  v: typeof LOG_SCHEMA_VERSION
  seq: number
  /** Wall seconds since the run started; for humans only. */
  timestamp: number
  runId: string
  event: N
  data: RunEventData<N>
}

/** The envelope's field names; no payload field may repeat one (#11 amendment 1). */
export const ENVELOPE_FIELDS = [
  'v',
  'seq',
  'tick',
  'timestamp',
  'runId',
  'playerId',
  'planet',
  'depthTiles',
  'event',
  'cmd',
  'data',
] as const satisfies readonly (keyof RunEvent)[]
