/**
 * The run's event log: stamps each event with the envelope (#11 section 1: version, run, order
 * and wall time) and hands it to the sink. One writer: only this module creates RunEvents. The
 * wall clock is injected (seconds since the run started), so tests control time; the game clock
 * is the `tick` the caller stamps.
 */
import type { RunEventSink } from './eventSink'
import type { RunEventData, RunEventName } from './eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent, type RunEventStamp } from './runEvent'

export interface RunLog {
  readonly runId: string
  record<N extends RunEventName>(stamp: RunEventStamp, event: N, data: RunEventData<N>): void
}

export interface RunLogOptions {
  runId: string
  sink: RunEventSink
  /** Seconds since the run started. */
  secondsSinceStart: () => number
}

export function createRunLog({ runId, sink, secondsSinceStart }: RunLogOptions): RunLog {
  let nextSeq = 0
  return {
    runId,
    record(stamp, event, data) {
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
    },
  }
}

const discardingRunLog: RunLog = { runId: 'run_none', record: () => undefined }

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
