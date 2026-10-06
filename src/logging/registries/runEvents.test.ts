import { describe, expect, it } from 'vitest'
import { addToRegistry, withFreshRegistrySet } from '../../systems/registries/seal'
import { registeredEventOf } from '../eventNames'
import { envelopeDuplicateProblems, floatFieldProblems, runEventProblems } from '../runEventSchema'
import { LOG_SCHEMA_VERSION } from '../runEvent'
import {
  RUN_EVENT_REGISTRATIONS,
  runEventRegistrationsOf,
  sliceRunEvents,
  type SliceRunEvent,
} from './runEvents'

/** `<slice>.<snake_case>`: the slice id is kebab-case, the name after it reads like the kernel's. */
const SLICE_RUN_EVENT_NAME = /^[a-z]+(-[a-z]+)*\.[a-z]+(_[a-z]+)*$/

const BELL_RUNG: SliceRunEvent = {
  group: 'progression',
  level: 'core',
  payload: { strokes: 'integer' },
}

function lineOf(event: string, data: unknown) {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: 0,
    tick: 60,
    timestamp: 1,
    runId: 'run_k1',
    playerId: 'p1',
    planet: 1,
    depthTiles: 0,
    event,
    data,
  }
}

function withBellRung<T>(run: () => T): T {
  return withFreshRegistrySet(
    () =>
      runEventRegistrationsOf({ 'example.bell_rung': BELL_RUNG }).forEach((registration) =>
        addToRegistry(RUN_EVENT_REGISTRATIONS, 'example', registration),
      ),
    run,
  )
}

describe('slice run events', () => {
  it('validates a line of a run event a slice registered', () => {
    const problems = withBellRung(() => [
      ...runEventProblems(lineOf('example.bell_rung', { strokes: 3 })),
      ...runEventProblems(lineOf('example.bell_rung', { strokes: 'three' })),
    ])
    expect(problems).toEqual([expect.stringContaining('strokes')])
  })

  it('refuses a slice event name no slice registered', () => {
    const problems = withBellRung(() => runEventProblems(lineOf('example.bell_cracked', {})))
    expect(problems).toEqual(['event "example.bell_cracked" is not registered'])
  })

  it('answers a kernel name from the kernel registry whatever slices registered', () => {
    expect(withBellRung(() => registeredEventOf('state_digest'))?.group).toBe('run')
  })

  it('names every loaded slice run event <slice>.<snake_case>, off the envelope and float-free', () => {
    const events = sliceRunEvents()
    for (const name of Object.keys(events)) expect(name).toMatch(SLICE_RUN_EVENT_NAME)
    expect(envelopeDuplicateProblems(events)).toEqual([])
    expect(floatFieldProblems(events)).toEqual([])
  })
})
