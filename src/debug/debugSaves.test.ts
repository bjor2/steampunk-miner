import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { installSaveFolder } from '../store/checkpoint'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { createMemorySaveFolder } from '../store/memorySaveFolder'
import { createDebugSaves } from './debugSaves'
import { sessionPoint } from './debugLiveTime'

let sink: ReturnType<typeof createMemorySink>

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  installSaveFolder({ folder: createMemorySaveFolder().folder, readWallClockMs: () => 0 })
})

afterEach(() => {
  installSaveFolder(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()

async function saveFromPauseMenu(slot: 'slot-1' | 'slot-2', name: string): Promise<void> {
  game().openPauseMenu()
  await game().openSaveSlots()
  game().setPauseSaveName(name)
  await game().saveToSlot(slot)
  game().closePauseMenu()
}

describe('debug saves', () => {
  it('lists the slot a pause-menu save wrote, with its name', async () => {
    await saveFromPauseMenu('slot-2', 'Probe')
    const listed = await createDebugSaves().list()
    expect(listed.ok && listed.entries.map(({ slot, name }) => ({ slot, name }))).toEqual([
      { slot: 'slot-2', name: 'Probe' },
    ])
  })

  it('loads a slot back to the session point it was saved at, logged as a debug command', async () => {
    game().fastForward(120)
    await saveFromPauseMenu('slot-1', 'Here')
    const saved = sessionPoint()
    game().fastForward(120)
    expect(await createDebugSaves().load('slot-1')).toEqual({ ok: true, ...saved })
    const commands = sink.events.filter((line) => line.event === 'debug_command_applied')
    expect(commands.at(-1)?.data).toEqual({ command: 'loadSaveSlot', args: { slot: 'slot-1' } })
  })

  it('refuses an empty slot and a name that is not a slot, changing nothing', async () => {
    const before = sessionPoint()
    expect(await createDebugSaves().load('slot-5')).toEqual({
      ok: false,
      problems: ['slot-5 holds no save'],
    })
    expect(await createDebugSaves().load('slot-10')).toEqual({
      ok: false,
      problems: ['"slot-10" is not a save slot'],
    })
    expect(sessionPoint()).toEqual(before)
  })
})
