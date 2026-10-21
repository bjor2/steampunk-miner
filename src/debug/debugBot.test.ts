import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../store/gameStore'
import { createDebugBot, MAX_PLANETS_AHEAD } from './debugBot'

// `steampunkDebug.bot.playToPlanet` (ticket 656): the pacing bot takes the live fresh save to a
// later planet by bought travel, and the session stays a play run (`debugApplied` false).

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const debugCommandsLogged = () =>
  sink.events
    .filter((event) => event.event === 'debug_command_applied')
    .map((event) => (event.data as { command: string }).command)

describe('debug bot', () => {
  it('lands the live fresh save on planet 2 as play, the replay matching the bot', async () => {
    const result = await createDebugBot().playToPlanet(2)
    expect(result).toMatchObject({ ok: true, planetIndex: 2, isReplayExact: true })
    expect(useGameStore.getState()).toMatchObject({ planetTier: 2, debugApplied: false })
    expect(debugCommandsLogged()).toEqual(['fastForward'])
  })

  it('refuses a planet behind the session or too far ahead, and changes nothing', async () => {
    const before = takeSessionSnapshot().digest
    for (const planet of [0, 1.5, 2 + MAX_PLANETS_AHEAD, '2']) {
      const result = await createDebugBot().playToPlanet(planet as number)
      expect(result.ok, `planet ${String(planet)}`).toBe(false)
    }
    expect(takeSessionSnapshot().digest).toBe(before)
    expect(readAuthorityState().planet.index).toBe(1)
  })
})
