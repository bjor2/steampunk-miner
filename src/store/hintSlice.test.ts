import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { surfaceOreTiles } from '../systems/authority/scriptedSession'
import type { ScriptedCommand } from '../systems/fastForward'
import { HINT_TABLE } from '../systems/hints/hintTable'
import { DEFAULT_PREFERENCES } from '../systems/input/preferences'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import { FACING, dockedPoseAt } from '../systems/vehicle/vehiclePose'
import { dockSiteOf } from '../systems/world/dockSite'
import { planetParamsFor } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import { readAuthorityTick, resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'
import { readVehicleIntent, resetInput, routeKeyChange } from './inputRuntime'
import { installPreferencesStorage, loadPreferences, preferencesWrites } from './preferencesFile'
import { readPlaqueModel, readSellBayModel, readTouchSituation } from './screenReads'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'

const PLANET_1 = planetParamsFor(1, 1)
const GAP = HINT_TABLE.minTicksBetweenHints

let file: string | null

beforeEach(() => {
  file = null
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  installPreferencesStorage({
    read: async () => file,
    write: async (json) => {
      file = json
    },
  })
  resetGameStore()
  resetInput()
})

afterEach(() => {
  uninstallRunLog()
  installPreferencesStorage(null)
})

const game = () => useGameStore.getState()

const idle = {
  vx: 0,
  vy: 0,
  upx: 0,
  upy: 1024,
  driving: false,
  thrusting: false,
  drilling: false,
  thrustTicks: 0,
  driveTicks: 0,
  drillTicks: 0,
  drive: NO_DRIVE,
}

function poseOver(tile: TilePoint, tick: number): ScriptedCommand {
  const at = { x: tile.tx * 1000 + 500, y: (tile.ty + 1) * 1000 + 500 }
  return { tick, type: 'reportPose', payload: { ...idle, ...at, facing: FACING.down } }
}

/** A first trip as the client scripts it: drive out, mine ore, wait, come home and dock. */
function playFirstTrip(): void {
  const start = readAuthorityTick() + 1
  const commands: ScriptedCommand[] = surfaceOreTiles(3, PLANET_1).flatMap((tile, index) => [
    poseOver(tile, start + GAP * index),
    { tick: start + GAP * index + 40, type: 'drillTile', payload: { ...tile, ticks: 40 } },
  ])
  const home = start + GAP * 3
  const atDock = { ...idle, ...dockedPoseAt(dockSiteOf(PLANET_1)) }
  commands.push({ tick: home, type: 'reportPose', payload: atDock })
  game().fastForward(home - readAuthorityTick(), commands)
  game().dock('sell')
  game().sellCargo('all')
}

/** Quit and launch again: a fresh store reading the same preferences file. */
async function reload(): Promise<void> {
  await preferencesWrites()
  resetGameStore()
  game().adoptPreferences(await loadPreferences())
}

describe('hint slice', () => {
  it('shows nothing before the run starts watching', () => {
    playFirstTrip()
    expect(readPlaqueModel()).toEqual({ hint: null, transmission: null })
  })

  it('shows hint_move and the opening transmission when the run starts', () => {
    game().startPlaques()
    expect(readPlaqueModel().hint?.id).toBe('hint_move')
    expect(readPlaqueModel().transmission?.id).toBe('transmission_opening')
  })

  it('takes the transmission down on any key, without taking the key away', () => {
    game().startPlaques()
    routeKeyChange({ code: 'KeyD', isDown: true, isRepeat: false, isShiftHeld: false })
    expect(readPlaqueModel().transmission).toBeNull()
    expect(readVehicleIntent()).not.toEqual(IDLE_INTENT)
  })

  it('keeps the seen-set in the preferences file, so nothing repeats after a reload', async () => {
    game().startPlaques()
    playFirstTrip()
    const seenBefore = game().prefs.seenHints
    await reload()
    game().startPlaques()
    playFirstTrip()
    expect(readPlaqueModel().transmission).toBeNull()
    expect(seenBefore).not.toContain(readPlaqueModel().hint?.id)
    expect(game().prefs.seenHints).toEqual(
      expect.arrayContaining(['hint_move', 'hint_drill', 'transmission_opening']),
    )
  })

  it('highlights Sell, repair and recharge while the dock hint is up on the first visit', () => {
    game().startPlaques()
    expect(readSellBayModel().quickService.isHighlighted).toBe(false)
    playFirstTrip()
    game().fastForward(GAP)
    expect(readPlaqueModel().hint?.id).toBe('hint_dock')
    expect(readSellBayModel().quickService.isHighlighted).toBe(true)
  })

  it('logs hint_shown once for hint_upgrade_bay, after the sale at the Sell bay pays for an upgrade', () => {
    const sink = createMemorySink()
    installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
    game().startPlaques()
    playFirstTrip()
    game().fastForward(GAP)
    game().undock()
    game().fastForward(GAP)
    expect(readPlaqueModel().hint?.id).toBe('hint_upgrade_bay')
    game().dock('sell')
    game().fastForward(GAP)
    const shown = sink.events.filter((line) => line.event === 'hint_shown')
    expect(shown.map((line) => (line.data as { hintId: string }).hintId)).toEqual([
      'hint_move',
      'hint_drill',
      'hint_cargo',
      'hint_dock',
      'hint_upgrade_bay',
    ])
  })

  it('shows no hint with Show hints off, but still the transmission', () => {
    game().setPreference('hintsEnabled', false)
    game().startPlaques()
    playFirstTrip()
    expect(readPlaqueModel().hint).toBeNull()
    expect(game().prefs.seenHints).toEqual(['transmission_opening'])
  })

  it('shows no plaque in a scenario run unless the file turns hints on', () => {
    game().applyScenario({ scenarioVersion: 1, name: 'quiet', worldSeed: 1, start: {} })
    game().startPlaques()
    expect(readPlaqueModel()).toEqual({ hint: null, transmission: null })
    game().applyScenario({
      scenarioVersion: 1,
      name: 'loud',
      worldSeed: 1,
      start: {},
      hintsEnabled: true,
    })
    game().observePlaques([])
    expect(readPlaqueModel().hint?.id).toBe('hint_move')
  })

  it('leaves the state digest of a run identical with hints on and off', () => {
    game().startPlaques()
    playFirstTrip()
    const withHints = takeSessionSnapshot().digest
    expect(game().prefs.seenHints.length).toBeGreaterThan(2)
    resetGameStore()
    game().setPreference('hintsEnabled', false)
    playFirstTrip()
    expect(takeSessionSnapshot().digest).toBe(withHints)
  })

  it('takes the shown hint down on a tap of its dismiss, and it never returns (#500)', async () => {
    game().startPlaques()
    expect(readPlaqueModel().hint?.id).toBe('hint_move')
    game().dismissHint()
    expect(readPlaqueModel().hint).toBeNull()
    game().observePlaques([])
    expect(readPlaqueModel().hint).toBeNull()
    await reload()
    game().startPlaques()
    expect(readPlaqueModel().hint?.id).not.toBe('hint_move')
  })

  it('remembers a dismissed hint in the seen-set it joined when shown: no new field (#500)', () => {
    game().startPlaques()
    const seenWhenShown = game().prefs.seenHints
    game().dismissHint()
    expect(game().prefs.seenHints).toEqual(seenWhenShown)
    expect(Object.keys(game().prefs).sort()).toEqual(Object.keys(DEFAULT_PREFERENCES).sort())
  })

  it('dismisses only the hint, never a control the hint pointed at (#500, HS)', () => {
    game().startPlaques()
    playFirstTrip()
    game().fastForward(GAP)
    expect(readPlaqueModel().hint?.id).toBe('hint_dock')
    const controls = readTouchSituation()
    const service = readSellBayModel().quickService
    game().dismissHint()
    expect(readTouchSituation()).toEqual(controls)
    expect(readSellBayModel().quickService).toEqual({ ...service, isHighlighted: false })
  })

  it('leaves the state digest the same whether a hint was dismissed or not (#500)', () => {
    game().startPlaques()
    game().dismissHint()
    playFirstTrip()
    const dismissed = takeSessionSnapshot().digest
    resetGameStore()
    game().startPlaques()
    playFirstTrip()
    expect(takeSessionSnapshot().digest).toBe(dismissed)
  })

  it('queues the hint while the compact HUD has no room and shows it once there is (#500)', () => {
    game().noteHintRoom(false)
    game().startPlaques()
    expect(readPlaqueModel().hint).toBeNull()
    expect(game().prefs.seenHints).not.toContain('hint_move')
    game().noteHintRoom(true)
    expect(readPlaqueModel().hint?.id).toBe('hint_move')
  })

  it('sends the hint up back to the queue when the room goes, and back up when it returns', () => {
    game().startPlaques()
    expect(readPlaqueModel().hint?.id).toBe('hint_move')
    game().noteHintRoom(false)
    expect(readPlaqueModel().hint).toBeNull()
    game().noteHintRoom(true)
    expect(readPlaqueModel().hint?.id).toBe('hint_move')
  })
})
