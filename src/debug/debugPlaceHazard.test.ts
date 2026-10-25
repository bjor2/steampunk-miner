import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { resetGameStore } from '../store/gameStore'
import { createDebugApi } from './debugApi'

// The hazards' scenario API (ticket 848): each #651 hazard placed in a cell as a logged `debug.*`
// command, a kind no contact-effect row plays refused, never trimmed.

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

describe('debug api: place hazard (ticket 848)', () => {
  it('places each of the four hazards as a logged debug command', () => {
    const debug = createDebugApi()
    const kinds = ['rockfall', 'firedamp', 'spinecrystal', 'steamvent']
    kinds.forEach((kind, at) => expect(debug.placeHazard(kind, 20 + at, 290)).toEqual({ ok: true }))
    expect(readAuthorityState().placedHazards).toEqual({
      '20,290': 'rockfall',
      '21,290': 'firedamp',
      '22,290': 'spinecrystal',
      '23,290': 'steamvent',
    })
    expect(sink.events.map((event) => event.event)).toContain('debug_command_applied')
  })

  it('refuses a kind no contact-effect row plays and places nothing', () => {
    expect(createDebugApi().placeHazard('quicksand', 20, 290)).toEqual({
      ok: false,
      problems: ['kind quicksand has no contact-effect row'],
    })
    expect(readAuthorityState().placedHazards).toBeUndefined()
  })
})
