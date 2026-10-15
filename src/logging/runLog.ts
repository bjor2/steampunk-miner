/**
 * The run's event log: stamps each event with the envelope (#11 section 1: version, run, order
 * and wall time) and hands it to the sink. One writer: only this module creates RunEvents. The
 * wall clock is injected (seconds since the run started), so tests control time; the game clock
 * is the `tick` the caller stamps.
 */
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import { createDrillSpanWriter, type DrillSpanWriter } from './drillSpanWriter'
import type { RunEventSink } from './eventSink'
import type { RunEventData, RunEventName } from './eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent, type RunEventStamp } from './runEvent'

/**
 * How a drill command's per-cell events are logged (ticket 420): folded into one `drill_cut` line
 * a span (the game's log), or one line each, the pre-compaction stream the before/after specs
 * compare it with.
 */
export type DrillLines = 'spans' | 'cells'

export interface RunLog {
  readonly runId: string
  record<N extends RunEventName>(stamp: RunEventStamp, event: N, data: RunEventData<N>): void
  /** Appends a submitted command to `commands.ndjson`, exactly as the authority receives it. */
  recordCommand(command: AuthorityCommand): void
  /**
   * The type of the player's last recorded command, when its seq is `seq`, else null: a command's
   * events are recorded right after it, so its line projections can ask what caused them
   * (`drill_cut`, ticket 335).
   */
  commandTypeOf(playerId: string, seq: number): string | null
  readonly drillLines: DrillLines
  /** Each player's open drill span, written when it closes (`drillSpanWriter.ts`, ticket 420). */
  readonly drillSpans: DrillSpanWriter
  /** Writes every open drill span's lines: at each sink flush and at the end of a run. */
  flushDrillSpans(): void
}

export interface RunLogOptions {
  runId: string
  sink: RunEventSink
  /** Seconds since the run started. */
  secondsSinceStart: () => number
  /** `spans` unless a spec wants the pre-compaction lines. */
  drillLines?: DrillLines
}

export function createRunLog({
  runId,
  sink,
  secondsSinceStart,
  drillLines = 'spans',
}: RunLogOptions): RunLog {
  let nextSeq = 0
  const lastCommands = new Map<string, { seq: number; type: string }>()
  const record: RunLog['record'] = (stamp, event, data) => {
    const stamped: RunEvent = {
      v: LOG_SCHEMA_VERSION,
      seq: nextSeq++,
      timestamp: secondsSinceStart(),
      runId,
      ...stamp,
      event,
      data,
    }
    sink.append(stamped)
  }
  const drillSpans = createDrillSpanWriter((stamp, line) => record(stamp, line.event, line.data))
  return {
    runId,
    record,
    recordCommand: (command) => {
      lastCommands.set(command.playerId, { seq: command.seq, type: command.type })
      drillSpans.noteCommand(command)
      sink.appendCommand(runId, command)
    },
    commandTypeOf: (playerId, seq) => {
      const last = lastCommands.get(playerId)
      return last?.seq === seq ? last.type : null
    },
    drillLines,
    drillSpans,
    flushDrillSpans: () => drillSpans.closeAll('end'),
  }
}

const discardingRunLog: RunLog = {
  runId: 'run_none',
  record: () => undefined,
  recordCommand: () => undefined,
  commandTypeOf: () => null,
  drillLines: 'cells',
  drillSpans: createDrillSpanWriter(() => undefined),
  flushDrillSpans: () => undefined,
}

let installed: RunLog = discardingRunLog

export function installRunLog(runLog: RunLog): void {
  installed = runLog
}

export function uninstallRunLog(): void {
  installed = discardingRunLog
}

/** Before a run starts (and in tests that do not care) events are discarded, not thrown. */
export function getRunLog(): RunLog {
  return installed
}
