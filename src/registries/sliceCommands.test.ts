import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../logging/domainEventLog'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import type { AuthorityCommand } from '../systems/authority/authorityCommand'
import { rejectionOf, type CommandRule } from '../systems/authority/commandRule'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { add, fromSafeInteger, toCanonical } from '../systems/money'
import { replayRun, type ReplayResult } from '../systems/replay/replayRun'
import { withRegistrations } from './registrar'
import type { SliceDefinition } from './sliceDefinition'

// A fake `example` slice that adds a command, a debug command, a domain event, a rejection reason
// and a run event the way a real slice does (docs/standards/feature-slices.md 3.15, K1): by
// augmentation and through the registrar, with no edit to a kernel list. Kernel specs never import
// a slice, so the fake lives here.
declare module '../systems/authority/authorityCommand' {
  interface CommandPayloads {
    'example.ringBell': { strokes: number }
    'debug.example.ringBell': { strokes: number }
  }
}
declare module '../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'example.BellRung': { strokes: number }
  }
  interface RejectionReasons {
    'example.bell_cracked': true
  }
}

const MOST_STROKES = 3

/** Each stroke pays the ringer one coin: a change the state digest sees. */
const RING_BELL: CommandRule<'example.ringBell' | 'debug.example.ringBell'> = {
  fields: { strokes: 'wholeNumber' },
  reject: (_state, { payload }) =>
    payload.strokes > MOST_STROKES
      ? rejectionOf('example.bell_cracked', `${payload.strokes} strokes crack the bell`)
      : null,
  apply: (state, { playerId, payload }) => {
    const player = state.players[playerId]
    const wallet = add(player.wallet, fromSafeInteger(payload.strokes))
    return {
      state: { ...state, players: { ...state.players, [playerId]: { ...player, wallet } } },
      events: [{ type: 'example.BellRung', strokes: payload.strokes }],
    }
  },
}

const EXAMPLE_SLICE: SliceDefinition = {
  id: 'example',
  register(r) {
    r.commandRules({ 'example.ringBell': RING_BELL, 'debug.example.ringBell': RING_BELL })
    r.eventProjections({
      'example.BellRung': ({ strokes }) => ({ event: 'example.bell_rung', data: { strokes } }),
    })
    r.runEvents({
      'example.bell_rung': { group: 'progression', level: 'core', payload: { strokes: 'integer' } },
    })
  },
}

const WORLD_SEED = 83921

type BellCommand = AuthorityCommand<'example.ringBell' | 'debug.example.ringBell'>

function ring(
  type: 'example.ringBell' | 'debug.example.ringBell',
  strokes: number,
  tick: number,
  seq: number,
): BellCommand {
  return { playerId: 'p1', tick, seq, type, payload: { strokes } }
}

/** Crosses the periodic digest at tick 3600, so the clock runs between slice commands. */
const BELL_RUN: readonly BellCommand[] = [
  ring('example.ringBell', 2, 30, 1),
  ring('example.ringBell', 5, 900, 2),
  ring('debug.example.ringBell', 1, 3700, 3),
  ring('example.ringBell', 3, 4000, 4),
]

function replayWithExample(framesPerSecond?: number): ReplayResult {
  return withRegistrations([EXAMPLE_SLICE], () =>
    replayRun(WORLD_SEED, BELL_RUN, { framesPerSecond }),
  )
}

function eventsOfSeq(events: readonly DomainEvent[], seq: number): DomainEvent[] {
  return events.filter((event) => event.seq === seq)
}

function logLinesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_k1', sink, secondsSinceStart: () => 0 })
  withRegistrations([EXAMPLE_SLICE], () =>
    recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events),
  )
  return sink.events
}

describe('slice commands (K1)', () => {
  it('replays a slice command to the same digests, jumping or at 30 and 144 frames per second', () => {
    const jumped = replayWithExample()
    expect(replayWithExample(30).digests).toEqual(jumped.digests)
    expect(replayWithExample(144).digests).toEqual(jumped.digests)
    expect(toCanonical(jumped.state.players.p1.wallet)).toBe('6e+0')
  })

  it("changes the digest only through the slice rule's own effect", () => {
    const silent = BELL_RUN.map((command): BellCommand => ({ ...command, payload: { strokes: 0 } }))
    const quiet = withRegistrations([EXAMPLE_SLICE], () => replayRun(WORLD_SEED, silent))
    const rung = replayWithExample()
    expect(rung.digests.map(({ tick }) => tick)).toEqual(quiet.digests.map(({ tick }) => tick))
    expect(rung.digests.at(-1)?.digest).not.toBe(quiet.digests.at(-1)?.digest)
  })

  it('answers the command with the slice event and logs it as the registered run event', () => {
    const { events } = replayWithExample()
    expect(eventsOfSeq(events, 1)).toEqual([
      { playerId: 'p1', tick: 30, seq: 1, type: 'example.BellRung', strokes: 2 },
    ])
    const lines = logLinesOf(events)
    expect(lines.filter((line) => line.event === ('example.bell_rung' as string))).toHaveLength(3)
    const problems = withRegistrations([EXAMPLE_SLICE], () => lines.flatMap(runEventProblems))
    expect(problems).toEqual([])
  })

  it("refuses with the slice's own rejection reason, logged as command_rejected", () => {
    const { events } = replayWithExample()
    expect(eventsOfSeq(events, 2)).toMatchObject([
      { type: 'CommandRejected', commandType: 'example.ringBell', reason: 'example.bell_cracked' },
    ])
    const refused = logLinesOf(eventsOfSeq(events, 2))
    expect(refused.map(({ event, data }) => ({ event, data }))).toEqual([
      {
        event: 'command_rejected',
        data: { type: 'example.ringBell', reason: 'example.bell_cracked' },
      },
    ])
  })

  it('applies a debug.example command as a debug command that logs debug_command_applied', () => {
    const { state, events } = replayWithExample()
    expect(state.debugApplied).toBe(true)
    const lines = logLinesOf(eventsOfSeq(events, 3))
    expect(lines.map(({ event, data }) => ({ event, data }))).toEqual([
      { event: 'example.bell_rung', data: { strokes: 1 } },
      {
        event: 'debug_command_applied',
        data: { command: 'debug.example.ringBell', args: { strokes: 1 } },
      },
    ])
  })

  it('leaves play undebugged while only play-side slice commands ran', () => {
    const play = BELL_RUN.filter((command) => command.type === 'example.ringBell')
    const { state } = withRegistrations([EXAMPLE_SLICE], () => replayRun(WORLD_SEED, play))
    expect(state.debugApplied).toBe(false)
  })
})
