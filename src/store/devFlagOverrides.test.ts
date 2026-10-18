import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEV_FLAGS } from '../constants/devFlags'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { runEventProblems } from '../logging/runEventSchema'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import { flagsOf, withDevFlagDelta } from '../systems/authority/devFlagState'
import { stateDigest } from '../systems/authority/stateDigest'
import {
  SHIPPED_DEV_FLAGS,
  withChosenDevFlags,
  devFlagOverridesText,
} from '../systems/devFlags/devFlagOverrides'
import { readAuthorityState } from './authorityLink'
import { installDevFlagStorage, type DevFlagStorage } from './devFlagSlice'
import { resetGameStore, useGameStore } from './gameStore'

// The browser's dev flag overrides in the store (ticket 548, the TD ruling on #547 and its #548
// ruling): read only through the storage a debug session installs, applied at each session's first
// tick as one logged `debug.setFlags`, and a default boot left on main's digests.

const PLAYER = 'player_1'
const TICKS = 120

let sink: MemorySink

/** A browser's `localStorage` item and the tab's marker, as the shell keeps them. */
interface MemoryFlagStorage extends DevFlagStorage {
  text: string | null
  isMarked: boolean
}

function createMemoryFlagStorage(text: string | null = null): MemoryFlagStorage {
  const storage: MemoryFlagStorage = {
    text,
    isMarked: true,
    read: () => storage.text,
    write: (next) => void (storage.text = next),
    forgetDebugSession: () => void (storage.isMarked = false),
  }
  return storage
}

const game = () => useGameStore.getState()

/** A page load: a fresh store and run log, the storage installed only in a debug session. */
function reload(storage: DevFlagStorage | null): void {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installDevFlagStorage(storage)
  game().loadDevFlagOverrides()
  game().startSessionDevFlags()
}

function playTicks(): string {
  for (let tick = 0; tick < TICKS; tick++) game().advanceOneTick()
  return stateDigest(readAuthorityState())
}

/** Main's digest: a launch with no dev flag code reached, played for the same ticks. */
function defaultDigest(): string {
  resetGameStore()
  return playTicks()
}

const setFlagsCommands = () => sink.commands.filter((command) => command.type === 'debug.setFlags')

afterEach(() => {
  installDevFlagStorage(null)
  uninstallRunLog()
})

describe('dev flag overrides at a session start (ticket 548)', () => {
  let mainDigest: string

  beforeEach(() => {
    mainDigest = defaultDigest()
  })

  it('boots a clean browser on the default digest, sending nothing', () => {
    reload(createMemoryFlagStorage())
    expect(playTicks()).toBe(mainDigest)
    expect(sink.commands).toEqual([])
    expect(game().clientDevFlags.flags).toEqual(DEV_FLAGS)
  })

  it('ignores a stored override in a session that installs no storage', () => {
    const stored = devFlagOverridesText(withChosenDevFlags({}, { 'drill.exactCarry': false }))
    createMemoryFlagStorage(stored)
    reload(null)
    expect(game().devFlagOverrides).toEqual({})
    expect(playTicks()).toBe(mainDigest)
  })

  it("remembers a toggle across a reload and sends it at the next session's first tick", () => {
    const storage = createMemoryFlagStorage()
    reload(storage)
    game().chooseDevFlags({ 'heat.workUncapped': false, 'drill.reportEveryTick': false })
    expect(JSON.parse(storage.text ?? '{}')).toEqual({
      'heat.workUncapped': { isOn: false, defaultWhenSet: true },
      'drill.reportEveryTick': { isOn: false, defaultWhenSet: true },
    })
    reload(storage)
    expect(setFlagsCommands()).toEqual([
      expect.objectContaining({ tick: 0, payload: { delta: { 'heat.workUncapped': false } } }),
    ])
    expect(flagsOf(readAuthorityState())['heat.workUncapped']).toBe(false)
    expect(game().clientDevFlags.flags['drill.reportEveryTick']).toBe(false)
  })

  it('drops a stored entry equal to its default and writes the store back cleaned', () => {
    const storage = createMemoryFlagStorage(
      JSON.stringify({
        'drill.exactCarry': { isOn: true, defaultWhenSet: true },
        'drill.tickFloor': { isOn: false, defaultWhenSet: true },
      }),
    )
    reload(storage)
    expect(storage.text).toBeNull()
    expect(playTicks()).toBe(mainDigest)
  })

  it('boots on the default digest after an override is set and then reset', () => {
    const storage = createMemoryFlagStorage()
    reload(storage)
    game().chooseDevFlags({ 'drill.exactCarry': false, 'drill.sweptCut': false })
    game().resetDevFlags()
    expect(storage.text).toBeNull()
    expect(storage.isMarked).toBe(false)
    reload(storage)
    expect(sink.commands).toEqual([])
    expect(playTicks()).toBe(mainDigest)
  })

  it('runs every flag at its shipped value after the reset button, in the session it was pressed', () => {
    reload(createMemoryFlagStorage())
    game().chooseDevFlags({ 'enemy.lureRetarget': false, 'drill.reportEveryTick': false })
    game().resetDevFlags()
    expect(flagsOf(readAuthorityState())).toEqual(flagsOf({}))
    expect(game().clientDevFlags.flags).toEqual(DEV_FLAGS)
    expect(readAuthorityState().devFlagsEverSet).toBe(true)
  })

  it('starts a New Game from the override, never from the old world delta', () => {
    const storage = createMemoryFlagStorage(
      devFlagOverridesText(withChosenDevFlags({}, { 'enemy.lureRetarget': false })),
    )
    reload(storage)
    game().setDevFlags({ 'drill.exactCarry': false })
    game().startNewGame()
    const flags = flagsOf(readAuthorityState())
    expect(flags['drill.exactCarry']).toBe(true)
    expect(flags['enemy.lureRetarget']).toBe(false)
  })

  it('keeps a loaded world delta and puts the override on top', () => {
    reload(
      createMemoryFlagStorage(
        devFlagOverridesText(withChosenDevFlags({}, { 'heat.workUncapped': false })),
      ),
    )
    game().resumeCheckpoint(checkpointOf(savedWithExactCarryOff()))
    const flags = flagsOf(readAuthorityState())
    expect(flags['drill.exactCarry']).toBe(false)
    expect(flags['heat.workUncapped']).toBe(false)
  })

  it('loads a world on its own delta outside a debug session', () => {
    reload(null)
    game().resumeCheckpoint(checkpointOf(savedWithExactCarryOff()))
    expect(flagsOf(readAuthorityState())['drill.exactCarry']).toBe(false)
    expect(setFlagsCommands()).toEqual([])
  })
})

describe('setting dev flags live (ticket 548)', () => {
  beforeEach(() => reload(null))

  it('sends the authority flags as one debug.setFlags and keeps the client flags local', () => {
    game().setDevFlags({ 'drill.reportEveryTick': false, 'enemy.lureRetarget': false })
    expect(setFlagsCommands().map((command) => command.payload)).toEqual([
      { delta: { 'enemy.lureRetarget': false } },
    ])
    expect(game().clientDevFlags.flags['drill.reportEveryTick']).toBe(false)
    const logged = sink.events.filter((line) => line.event === 'debug_command_applied')
    expect(logged.map((line) => (line.data as { command: string }).command)).toEqual([
      'debug.setFlags',
      'setClientDevFlags',
    ])
    sink.events.forEach((line) => expect(runEventProblems(line)).toEqual([]))
  })

  it('marks the run when only a client flag changes', () => {
    game().setDevFlags({ 'drill.reportEveryTick': false })
    expect(setFlagsCommands().map((command) => command.payload)).toEqual([{ delta: {} }])
    expect(readAuthorityState().devFlagsEverSet).toBe(true)
  })

  it('holds a drill.sweptCut flip pending until the drill is idle, then applies it', () => {
    game().setDevFlags({ 'drill.sweptCut': false })
    expect(game().clientDevFlags).toEqual({
      flags: DEV_FLAGS,
      pending: { 'drill.sweptCut': false },
    })
    game().settleClientDevFlags(false)
    expect(game().clientDevFlags.flags['drill.sweptCut']).toBe(true)
    game().settleClientDevFlags(true)
    expect(game().clientDevFlags).toEqual({
      flags: { ...DEV_FLAGS, 'drill.sweptCut': false },
      pending: {},
    })
  })

  it('changes no digest for flags chosen at their shipped values', () => {
    const before = stateDigest(readAuthorityState())
    game().setDevFlags(SHIPPED_DEV_FLAGS)
    expect(sink.commands).toEqual([])
    expect(stateDigest(readAuthorityState())).toBe(before)
  })

  it('refuses unknown flags and numbers whole, changing nothing', () => {
    expect(() =>
      game().setDevFlags({ 'drill.reportEveryTick': false, 'drill.lawPerLevel': 1.12 } as never),
    ).toThrow(/"drill.lawPerLevel" is not a dev flag/)
    expect(sink.commands).toEqual([])
    expect(game().clientDevFlags.flags).toEqual(DEV_FLAGS)
  })

  it('runs a scenario on the shipped client flags', () => {
    game().setDevFlags({ 'drill.reportEveryTick': false })
    game().applyScenario({ scenarioVersion: 1, name: 'empty', worldSeed: 1, start: {} })
    expect(game().clientDevFlags.flags).toEqual(DEV_FLAGS)
    expect('devFlagsEverSet' in readAuthorityState()).toBe(false)
  })
})

function savedWithExactCarryOff(): AuthorityState {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: [PLAYER] })
  return withDevFlagDelta(start, { 'drill.exactCarry': false })
}

function checkpointOf(state: AuthorityState) {
  return { slot: 'autosave' as const, state, saveEpoch: 1, unlocked: [], migrations: [] }
}
