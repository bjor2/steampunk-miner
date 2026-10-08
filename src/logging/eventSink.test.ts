import { describe, expect, it } from 'vitest'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import { expandCommandLog, type LoggedCommand } from './commandLog'
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

  function poseAt(seq: number, drive: { x: -1 | 0 | 1; y: -1 | 0 | 1 }): AuthorityCommand {
    const flags = { driving: false, thrusting: false, drilling: false }
    const ticks = { thrustTicks: 0, driveTicks: 0, drillTicks: 0 }
    const pose = { x: 0, y: 0, vx: 0, vy: 0, upx: 0, upy: 1024, facing: 1 }
    const payload = { ...pose, ...flags, ...ticks, drive }
    return { playerId: 'player_1', tick: 12 * seq, seq, type: 'reportPose', payload }
  }

  const linesOf = (text: string) =>
    text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as LoggedCommand)

  it('writes a pose report drive only when it changed, and the file expands back (ticket 342)', async () => {
    const { transport, commandsSent } = recordingTransport()
    const sink = createNdjsonSink(transport)
    const poses = [
      poseAt(1, { x: 0, y: -1 }),
      poseAt(2, { x: 0, y: -1 }),
      poseAt(3, { x: 1, y: 0 }),
    ]
    poses.forEach((pose) => sink.appendCommand('run_a', pose))
    await sink.flush()
    const lines = linesOf(commandsSent[0].text)
    expect(lines.map((line) => line.type === 'reportPose' && 'drive' in line.payload)).toEqual([
      true,
      false,
      true,
    ])
    expect(expandCommandLog(lines)).toEqual(poses)
  })

  it("starts each run's file with the drive written", async () => {
    const { transport, commandsSent } = recordingTransport()
    const sink = createNdjsonSink(transport)
    sink.appendCommand('run_a', poseAt(1, { x: 0, y: -1 }))
    sink.appendCommand('run_b', poseAt(1, { x: 0, y: -1 }))
    await sink.flush()
    expect(commandsSent.map(({ text }) => expandCommandLog(linesOf(text)))).toHaveLength(2)
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
