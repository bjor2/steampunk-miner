/**
 * The run's event log: stamps each event with its run, order and time, and hands it to the sink.
 * One writer: only this module creates RunEvents. The clock is injected (seconds since the run
 * started), so tests control time.
 */
import type { RunEventSink } from './eventSink'
import type { RunEventName } from './eventNames'
import type { RunEvent, RunEventContext, RunEventData } from './runEvent'

export interface RunLog {
  readonly runId: string
  record<N extends RunEventName>(context: RunEventContext, event: N, data: RunEventData<N>): void
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
    record(context, event, data) {
      const stamped: RunEvent = {
        seq: nextSeq++,
        timestamp: secondsSinceStart(),
        runId,
        ...context,
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
