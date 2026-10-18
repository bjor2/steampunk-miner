import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEV_FLAGS } from '../constants/devFlags'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { runEventProblems } from '../logging/runEventSchema'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createAuthorityState, type AuthorityState } from '../systems/authority/authorityState'
import { flagsOf, withDevFlagDelta } from '../systems/authority/devFlagState'
import { OVER_SAVE_NOTE } from '../systems/devFlags/devFlagBadge'
import {
  devFlagOverridesText,
  withChosenDevFlags,
  type DevFlagChoice,
} from '../systems/devFlags/devFlagOverrides'
import type { DevFlagPanelRow } from '../systems/devFlags/devFlagPanelModel'
import { readAuthorityState } from './authorityLink'
import { installSaveFolder } from './checkpoint'
import { installDebugSessionEntry } from './devFlagPanelSlice'
import { readDevFlagBadge, readDevFlagPanelModel } from './devFlagReads'
import { installDevFlagStorage, type DevFlagStorage } from './devFlagSlice'
import { resetGameStore, useGameStore } from './gameStore'
import { createMemorySaveFolder } from './memorySaveFolder'

// The debug flag panel, the hidden gesture and the badge in the store (ticket 549, the TD ruling
// on #547 and its #548 ruling): the gesture enters a debug session that reads the browser's
// overrides, the panel's switches go through the same command path as `ui.setDevFlags` and are
// remembered, the reset button restores the shipped flags, and the badge counts what is off.

const PLAYER = 'player_1'

let sink: MemorySink

/** A browser's `localStorage` item and the tab's marker, as the shell keeps them. */
interface MemoryTab extends DevFlagStorage {
  text: string | null
  isMarked: boolean
}

function createMemoryTab(choice: DevFlagChoice = {}): MemoryTab {
  const tab: MemoryTab = {
    text: devFlagOverridesText(withChosenDevFlags({}, choice)),
    isMarked: false,
    read: () => tab.text,
    write: (next) => void (tab.text = next),
    forgetDebugSession: () => void (tab.isMarked = false),
  }
  return tab
}

/** The shell's entry for a player's launch: marks the tab and hands its storage over. */
function offerGestureOn(tab: MemoryTab): void {
  installDebugSessionEntry(() => {
    tab.isMarked = true
    return tab
  })
}

/** A player's launch straight into play: no storage installed, no override read. */
function launchAsPlayer(): void {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  game().loadDevFlagOverrides()
  game().startSessionDevFlags()
}

/** A reload of a debug session's tab: its storage installed and read at launch. */
function relaunchDebugSession(tab: MemoryTab): void {
  launchAsPlayer()
  installDevFlagStorage(tab)
  game().loadDevFlagOverrides()
  game().startSessionDevFlags()
}

const game = () => useGameStore.getState()
const setFlagsCommands = () => sink.commands.filter((command) => command.type === 'debug.setFlags')
const rowOf = (id: string) =>
  readDevFlagPanelModel()
    .groups.flatMap((group) => group.rows)
    .find((row) => row.id === id) as DevFlagPanelRow

beforeEach(() => launchAsPlayer())

afterEach(() => {
  installDevFlagStorage(null)
  installDebugSessionEntry(null)
  installSaveFolder(null)
  uninstallRunLog()
})

describe('dev flag panel: the hidden gesture (ticket 549)', () => {
  it('keeps the panel closed and the badge hidden on a player launch with a stored override', () => {
    createMemoryTab({ 'heat.workUncapped': false })
    expect(game().isDevFlagPanelOpen).toBe(false)
    expect(game().isDevFlagSessionOn).toBe(false)
    expect(readDevFlagBadge()).toBeNull()
    expect(flagsOf(readAuthorityState())['heat.workUncapped']).toBe(true)
  })

  it('marks the tab, reads the overrides, sends them at once and opens the panel', () => {
    const tab = createMemoryTab({ 'heat.workUncapped': false })
    offerGestureOn(tab)
    game().enterDebugSessionByGesture()
    expect(tab.isMarked).toBe(true)
    expect(game().isDevFlagPanelOpen).toBe(true)
    expect(game().isDevFlagSessionOn).toBe(true)
    expect(setFlagsCommands()).toEqual([
      expect.objectContaining({ payload: { delta: { 'heat.workUncapped': false } } }),
    ])
    expect(readDevFlagBadge()?.title).toBe('1 debug flag')
  })

  it('logs the entry as a debug command, so the session reads as a debug one', () => {
    offerGestureOn(createMemoryTab())
    game().enterDebugSessionByGesture()
    const entered = sink.events.find((line) => line.event === 'debug_command_applied')
    expect(entered?.data).toEqual({
      command: 'enterDebugSession',
      args: { via: 'versionLabelHold' },
    })
    expect(sink.events.flatMap((line) => runEventProblems(line))).toEqual([])
  })

  it('on the title screen reads the overrides and leaves them for the game it starts', async () => {
    installSaveFolder({ folder: createMemorySaveFolder().folder, readWallClockMs: () => 0 })
    await game().openTitleMenu()
    offerGestureOn(createMemoryTab({ 'enemy.lureRetarget': false }))
    game().enterDebugSessionByGesture()
    expect(setFlagsCommands()).toEqual([])
    expect(readDevFlagBadge()?.count).toBe(1)
    game().confirmNewGame()
    expect(flagsOf(readAuthorityState())['enemy.lureRetarget']).toBe(false)
  })

  it('only opens the panel where no entry is offered (a scenario launch, a spec)', () => {
    game().enterDebugSessionByGesture()
    expect(game().isDevFlagPanelOpen).toBe(true)
    expect(game().isDevFlagSessionOn).toBe(false)
    expect(sink.events.filter((line) => line.event === 'debug_command_applied')).toEqual([])
  })

  it('sends nothing again when a debug session holds it a second time', () => {
    offerGestureOn(createMemoryTab({ 'heat.workUncapped': false }))
    game().enterDebugSessionByGesture()
    game().closeDevFlagPanel()
    game().enterDebugSessionByGesture()
    expect(setFlagsCommands()).toHaveLength(1)
    expect(game().isDevFlagPanelOpen).toBe(true)
  })
})

describe('dev flag panel: switches, reset and badge (ticket 549)', () => {
  it('applies an authority switch live and remembers it across a reload', () => {
    const tab = createMemoryTab()
    relaunchDebugSession(tab)
    game().chooseDevFlags({ 'drill.exactCarry': false })
    expect(rowOf('drill.exactCarry')).toMatchObject({ isOn: false, isRemembered: true })
    expect(rowOf('drill.reportEveryTick').pairWarnings).toHaveLength(1)
    relaunchDebugSession(tab)
    expect(rowOf('drill.exactCarry').isOn).toBe(false)
    expect(readDevFlagBadge()?.title).toBe('1 debug flag')
  })

  it('shows a swept cut flip pending while the drill bites', () => {
    relaunchDebugSession(createMemoryTab())
    game().chooseDevFlags({ 'drill.sweptCut': false })
    expect(rowOf('drill.sweptCut')).toMatchObject({ isOn: false, isPending: true })
    game().settleClientDevFlags(true)
    expect(rowOf('drill.sweptCut').isPending).toBe(false)
  })

  it('resets to exactly the shipped flags, clears the store and the marker, and drops the badge', () => {
    const tab = createMemoryTab({ 'heat.workUncapped': false, 'drill.reportEveryTick': false })
    tab.isMarked = true
    relaunchDebugSession(tab)
    expect(readDevFlagBadge()?.count).toBe(2)
    game().resetDevFlags()
    expect(tab.text).toBeNull()
    expect(tab.isMarked).toBe(false)
    expect(flagsOf(readAuthorityState())).toEqual(flagsOf({}))
    expect(game().clientDevFlags.flags).toEqual(DEV_FLAGS)
    expect(readDevFlagBadge()).toBeNull()
    expect(readDevFlagPanelModel().isRunMarked).toBe(true)
  })

  it('says when the remembered override runs over a loaded save, and forgets it on New Game', () => {
    relaunchDebugSession(createMemoryTab({ 'heat.workUncapped': false }))
    game().resumeCheckpoint(checkpointOf(savedWithExactCarryOff()))
    expect(game().overriddenSaveFlags).toEqual(['heat.workUncapped'])
    expect(rowOf('heat.workUncapped').isOverSave).toBe(true)
    expect(readDevFlagBadge()).toMatchObject({ count: 2, note: OVER_SAVE_NOTE })
    game().startNewGame()
    expect(game().overriddenSaveFlags).toEqual([])
    expect(readDevFlagBadge()?.note).toBe('')
  })

  it('loads a save on its own flags, the badge counting them, when no override changes them', () => {
    relaunchDebugSession(createMemoryTab())
    game().resumeCheckpoint(checkpointOf(savedWithExactCarryOff()))
    expect(game().overriddenSaveFlags).toEqual([])
    expect(readDevFlagBadge()).toEqual({ count: 1, title: '1 debug flag', note: '' })
  })
})

function savedWithExactCarryOff(): AuthorityState {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: [PLAYER] })
  return withDevFlagDelta(start, { 'drill.exactCarry': false })
}

function checkpointOf(state: AuthorityState) {
  return { slot: 'autosave' as const, state, saveEpoch: 1, unlocked: [], migrations: [] }
}
