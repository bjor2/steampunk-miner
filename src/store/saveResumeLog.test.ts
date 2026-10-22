import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POSE_REPORT_INTERVAL_TICKS } from '../constants/balance'
import { TICKS_PER_SECOND } from '../constants/physics'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import type { RunEvent } from '../logging/runEvent'
import { runEventProblems } from '../logging/runEventSchema'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { vehicleOf, type AuthorityState } from '../systems/authority/authorityState'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { stateDigest } from '../systems/authority/stateDigest'
import { HINT_TABLE } from '../systems/hints/hintTable'
import { AUTOSAVE_SLOT } from '../systems/save/saveSlotIndex'
import { cutStepMmOf } from '../systems/vehicle/cutSpeed'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { subStepsPerTile } from '../systems/vehicle/drillRule'
import { bandRockHardnessOf } from '../systems/vehicle/nominalGround'
import { statsOfVehicle } from '../systems/vehicle/vehicleState'
import { FACING } from '../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../systems/world/planetParams'
import { surfaceRowOfColumn } from '../systems/world/tileGrid'
import { readAuthorityState } from './authorityLink'
import { checkpointWrites, installSaveFolder } from './checkpoint'
import { resetGameStore, useGameStore } from './gameStore'
import { resetInput } from './inputRuntime'
import { createMemorySaveFolder } from './memorySaveFolder'

// Ticket 671, the Game Director's check on spec #401: save at a station, load, then 60 s of the
// same input logs the same NDJSON lines as the run that was never saved, on the same seed and
// version. A line's `seq`, `timestamp` and `runId` number and stamp the run that wrote it, so the
// comparison leaves them out (`runEvent.ts`: they never enter a comparison); every other field,
// the tick, the place, the command ref and the payload, must match.

const PLAY_TICKS = 60 * TICKS_PER_SECOND
/** A band-1 column east of the pad, as the planet-200 dive fixture takes. */
const DIG_COLUMN = 20
const WALL_CLOCK_MS = 1_760_000_000_000

let disk: ReturnType<typeof createMemorySaveFolder>
let sink: MemorySink

/** A fresh process over `disk`: a new store, input and run log. */
function startProcess(): void {
  resetGameStore()
  resetInput()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_671', sink, secondsSinceStart: () => 0 }))
  installSaveFolder({ folder: disk.folder, readWallClockMs: () => WALL_CLOCK_MS })
}

beforeEach(() => {
  disk = createMemorySaveFolder()
  startProcess()
})

afterEach(() => {
  installSaveFolder(null)
  uninstallRunLog()
})

const game = () => useGameStore.getState()

/**
 * New Game from the title, as a player starts: the hints watch from here. The 20 s the hints keep
 * apart is session state, never saved (`hintSlice.ts`), so the station save waits it out first.
 */
function startNewGameAndWaitOutTheHintGap(): void {
  game().confirmNewGame()
  for (let tick = 0; tick < HINT_TABLE.minTicksBetweenHints; tick++) game().advanceOneTick()
}

/** Docks at the Sell bay, a checkpoint moment, and waits for the autosave to land. */
async function dockAtStationAndSave(): Promise<void> {
  game().dock('sell')
  await checkpointWrites()
}

/**
 * A new process over a copy of the disk as the station save left it: the unbroken run writes
 * later autosaves (a rescue docks the rig), which the resumed run must not load.
 */
function startProcessOver(savedItems: ReadonlyMap<string, string>): void {
  disk = createMemorySaveFolder()
  savedItems.forEach((text, key) => disk.items.set(key, text))
  startProcess()
}

/** As a player picks the autosave on the title menu, in the new process. */
async function loadAutosave(): Promise<void> {
  await game().loadGameFromSlot(AUTOSAVE_SLOT)
  await checkpointWrites()
}

interface DigPath {
  x: number
  topY: number
  stepMm: number
}

/** The column the 60 s dig down, at the speed the docked vehicle's drill cuts band 1. */
function digPathOf(state: AuthorityState, playerId: string): DigPath {
  const params = planetParamsOf(state.planet) as PlanetParams
  const vehicle = vehicleOf(state, playerId)
  const hardness = bandRockHardnessOf(vehicle, params)
  const subSteps = hardness === null ? null : subStepsPerTile(statsOfVehicle(vehicle), hardness)
  if (subSteps === null) throw new Error('the drill cannot scratch band 1')
  const surfaceRow = surfaceRowOfColumn(DIG_COLUMN, params.radiusTiles)
  return {
    x: DIG_COLUMN * 1000 + 500,
    topY: (surfaceRow + 1) * 1000 + 400,
    stepMm: cutStepMmOf(subSteps),
  }
}

/** 60 s as the live client plays them: undock, then a pose report each interval and a drill step each tick. */
function playDigInput(path: DigPath): void {
  game().undock()
  for (let tick = 0; tick < PLAY_TICKS; tick++) {
    if (isRigActive()) playDigTick(path, tick)
    game().advanceOneTick()
  }
}

/** The player steers only a rig out on its trip: once wrecked and rescued it sits docked. */
function isRigActive(): boolean {
  return vehicleOf(readAuthorityState(), game().playerId).mode === 'active'
}

function playDigTick(path: DigPath, tick: number): void {
  const y = path.topY - path.stepMm * tick
  if (tick % POSE_REPORT_INTERVAL_TICKS === 0) game().reportPose(digPoseAt(path.x, y, tick))
  game().stepDrill({
    type: 'drillStep',
    payload: { x: path.x, y, facing: FACING.down, drive: NO_DRIVE },
  })
}

function digPoseAt(x: number, y: number, tick: number) {
  const drillTicks = tick === 0 ? 0 : POSE_REPORT_INTERVAL_TICKS
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.down,
    driving: false,
    thrusting: false,
    drilling: drillTicks > 0,
    thrustTicks: 0,
    driveTicks: 0,
    drillTicks,
    drive: NO_DRIVE,
  }
}

/** A line as NDJSON without the fields that number or stamp the run that wrote it. */
function comparableLine({
  seq: _seq,
  timestamp: _timestamp,
  runId: _runId,
  ...line
}: RunEvent): string {
  return JSON.stringify(line)
}

/** Plays the 60 s and answers the lines they logged, the saves they queued landed, as NDJSON. */
async function linesOfDig(path: DigPath): Promise<string[]> {
  const from = sink.events.length
  playDigInput(path)
  await checkpointWrites()
  return sink.events.slice(from).map(comparableLine)
}

describe('save resume log (ticket 671)', () => {
  it('logs the same NDJSON for 60 s of the same input after a load at the station as unbroken', async () => {
    startNewGameAndWaitOutTheHintGap()
    await dockAtStationAndSave()
    const savedItems = new Map(disk.items)
    // The preferences file outlives the process (`preferencesFile.ts`), and with it the hints seen.
    const seenHints = game().prefs.seenHints
    const path = digPathOf(readAuthorityState(), game().playerId)
    const unbroken = await linesOfDig(path)
    const unbrokenDigest = stateDigest(readAuthorityState())

    startProcessOver(savedItems)
    game().rememberSeenHints(seenHints)
    await loadAutosave()
    const resumed = await linesOfDig(path)

    expect(resumed).toEqual(unbroken)
    expect(stateDigest(readAuthorityState())).toBe(unbrokenDigest)
  })

  // The dig runs at the drill's own speed into band 2, where a grade-1 casing caves in on the rig:
  // the window holds cuts, casing, collapses, the rescue to the station and the autosave it writes.
  it('cuts, caves in, rescues and saves in those 60 s, so the lines compared carry play', async () => {
    await dockAtStationAndSave()
    const lines = await linesOfDig(digPathOf(readAuthorityState(), game().playerId))
    const names = lines.map((line) => (JSON.parse(line) as RunEvent).event)
    expect(names).toEqual(
      expect.arrayContaining(['drill_cut', 'collapse', 'rescue_triggered', 'checkpoint_saved']),
    )
    expect(names).not.toContain('command_rejected')
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })
})
