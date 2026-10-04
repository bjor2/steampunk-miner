/**
 * Where run events go. The game talks to RunEventSink only; the Electron/browser shell is
 * reached through RunLogTransport, so logging never imports src/shell.
 */
import { formatNdjsonLine } from './ndjson'
import type { RunEvent } from './runEvent'

export interface RunEventSink {
  append(event: RunEvent): void
}

/** What the NDJSON sink needs from the shell. */
export interface RunLogTransport {
  appendRunEvents(runId: string, ndjsonLines: string): Promise<void>
}

export interface FlushableSink extends RunEventSink {
  /** Sends buffered lines. Lines the transport rejects stay buffered for the next flush. */
  flush(): Promise<void>
}

/** Keeps events in memory: for tests and for a bot that reads the log back. */
export function createMemorySink(): RunEventSink & { readonly events: readonly RunEvent[] } {
  const events: RunEvent[] = []
  return { events, append: (event) => void events.push(event) }
}

export function createNdjsonSink(transport: RunLogTransport): FlushableSink {
  const pendingByRun = new Map<string, string[]>()

  const append = (event: RunEvent): void => {
    const pending = pendingByRun.get(event.runId) ?? []
    pending.push(formatNdjsonLine(event))
    pendingByRun.set(event.runId, pending)
  }

  const flush = async (): Promise<void> => {
    for (const [runId, lines] of [...pendingByRun]) {
      pendingByRun.delete(runId)
      await sendOrKeep(runId, lines)
    }
  }

  const sendOrKeep = async (runId: string, lines: string[]): Promise<void> => {
    try {
      await transport.appendRunEvents(runId, lines.join(''))
    } catch (error) {
      const newer = pendingByRun.get(runId) ?? []
      pendingByRun.set(runId, [...lines, ...newer])
      throw error
    }
  }

  return { append, flush }
}
