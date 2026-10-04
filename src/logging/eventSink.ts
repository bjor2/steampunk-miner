/**
 * Where run events and commands go. The game talks to RunEventSink only; the Electron/browser
 * shell is reached through RunLogTransport, so logging never imports src/shell.
 *
 * Commands go to their own file, `commands.ndjson`: with the world seed they are the replay input
 * of a run (#11 section 3), so they are written in every run.
 */
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import { formatNdjsonLine } from './ndjson'
import type { RunEvent } from './runEvent'

export interface RunEventSink {
  append(event: RunEvent): void
  appendCommand(runId: string, command: AuthorityCommand): void
}

/** What the NDJSON sink needs from the shell. */
export interface RunLogTransport {
  appendRunEvents(runId: string, ndjsonLines: string): Promise<void>
  appendRunCommands(runId: string, ndjsonLines: string): Promise<void>
}

export interface FlushableSink extends RunEventSink {
  /** Sends buffered lines. Lines the transport rejects stay buffered for the next flush. */
  flush(): Promise<void>
}

export interface MemorySink extends RunEventSink {
  readonly events: readonly RunEvent[]
  readonly commands: readonly AuthorityCommand[]
}

/** Keeps events and commands in memory: for tests, the summary and a bot that reads them back. */
export function createMemorySink(): MemorySink {
  const events: RunEvent[] = []
  const commands: AuthorityCommand[] = []
  return {
    events,
    commands,
    append: (event) => void events.push(event),
    appendCommand: (_runId, command) => void commands.push(command),
  }
}

/** Hands every event and command to each of `sinks`, in order. */
export function createFanOutSink(...sinks: readonly RunEventSink[]): RunEventSink {
  return {
    append: (event) => sinks.forEach((sink) => sink.append(event)),
    appendCommand: (runId, command) => sinks.forEach((sink) => sink.appendCommand(runId, command)),
  }
}

export function createNdjsonSink(transport: RunLogTransport): FlushableSink {
  const events = createLineBuffer((runId, text) => transport.appendRunEvents(runId, text))
  const commands = createLineBuffer((runId, text) => transport.appendRunCommands(runId, text))
  return {
    append: (event) => events.add(event.runId, formatNdjsonLine(event)),
    appendCommand: (runId, command) => commands.add(runId, formatNdjsonLine(command)),
    flush: async () => {
      await events.flush()
      await commands.flush()
    },
  }
}

type SendLines = (runId: string, text: string) => Promise<void>

/** Lines per run, sent in order; lines the transport rejects stay for the next flush. */
function createLineBuffer(send: SendLines) {
  const pendingByRun = new Map<string, string[]>()

  const add = (runId: string, line: string): void => {
    const pending = pendingByRun.get(runId) ?? []
    pending.push(line)
    pendingByRun.set(runId, pending)
  }

  const flush = async (): Promise<void> => {
    for (const [runId, lines] of [...pendingByRun]) {
      pendingByRun.delete(runId)
      await sendOrKeep(runId, lines)
    }
  }

  const sendOrKeep = async (runId: string, lines: string[]): Promise<void> => {
    try {
      await send(runId, lines.join(''))
    } catch (error) {
      const newer = pendingByRun.get(runId) ?? []
      pendingByRun.set(runId, [...lines, ...newer])
      throw error
    }
  }

  return { add, flush }
}
