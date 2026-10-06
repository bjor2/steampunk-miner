import { describe, expect, it } from 'vitest'
import {
  createFanOutSink,
  createMemorySink,
  createNdjsonSink,
  type RunLogTransport,
} from './eventSink'
import { parseNdjson } from './ndjson'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

function eventNumber(seq: number, runId = 'run_a'): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq,
    tick: 0,
    timestamp: seq,
    runId,
    playerId: 'player_1',
    planet: 0,
    depthTiles: 0,
    event: 'game_started',
    data: { gameVersion: 't', buildCommit: 't', platform: 'browser', debug: false },
  }
}

function recordingTransport(failures = 0) {
  const sent: { runId: string; text: string }[] = []
  let remainingFailures = failures
  const commandsSent: { runId: string; text: string }[] = []
  const transport: RunLogTransport = {
    appendRunEvents: async (runId, text) => {
      if (remainingFailures-- > 0) throw new Error('disk full')
      sent.push({ runId, text })
    },
    appendRunCommands: async (runId, text) => void commandsSent.push({ runId, text }),
  }
  return { transport, sent, commandsSent }
}

describe('ndjson sink', () => {
  it('sends buffered events to the transport in order on flush', async () => {
    const { transport, sent } = recordingTransport()
    const sink = createNdjsonSink(transport)
    sink.append(eventNumber(0))
    sink.append(eventNumber(1))
    await sink.flush()
    expect(sent).toHaveLength(1)
    expect(parseNdjson(sent[0].text).map((event) => event.seq)).toEqual([0, 1])
  })

  it('sends nothing when nothing happened', async () => {
    const { transport, sent } = recordingTransport()
    await createNdjsonSink(transport).flush()
    expect(sent).toEqual([])
  })

  it('does not send the same event twice', async () => {
    const { transport, sent } = recordingTransport()
    const sink = createNdjsonSink(transport)
    sink.append(eventNumber(0))
    await sink.flush()
    await sink.flush()
    expect(sent).toHaveLength(1)
  })

  it('keeps events for the next flush when the transport fails', async () => {
    const { transport, sent } = recordingTransport(1)
    const sink = createNdjsonSink(transport)
    sink.append(eventNumber(0))
    await expect(sink.flush()).rejects.toThrow('disk full')
    sink.append(eventNumber(1))
    await sink.flush()
    expect(parseNdjson(sent[0].text).map((event) => event.seq)).toEqual([0, 1])
  })

  it('keeps each run in its own file', async () => {
    const { transport, sent } = recordingTransport()
    const sink = createNdjsonSink(transport)
    sink.append(eventNumber(0, 'run_a'))
    sink.append(eventNumber(0, 'run_b'))
    await sink.flush()
    expect(sent.map((entry) => entry.runId).sort()).toEqual(['run_a', 'run_b'])
  })
})

describe('ndjson sink: commands', () => {
  const command = {
    playerId: 'player_1',
    tick: 60,
    seq: 1,
    type: 'debug.grantMoney',
    payload: { amount: '1e+30' },
  } as const

  it('writes submitted commands to their own file, exactly as the authority received them', async () => {
    const { transport, sent, commandsSent } = recordingTransport()
    const sink = createNdjsonSink(transport)
    sink.appendCommand('run_a', command)
    await sink.flush()
    expect(sent).toEqual([])
    expect(commandsSent).toEqual([{ runId: 'run_a', text: `${JSON.stringify(command)}\n` }])
  })

  it('hands events and commands to every fanned-out sink', () => {
    const first = createMemorySink()
    const second = createMemorySink()
    const sink = createFanOutSink(first, second)
    sink.appendCommand('run_a', command)
    sink.append(eventNumber(0))
    expect([first.commands, second.commands]).toEqual([[command], [command]])
    expect(second.events.map((event) => event.seq)).toEqual([0])
  })
})
