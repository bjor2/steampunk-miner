import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import type { ActionId } from '../systems/input/actionMap'
import { FACING } from '../systems/vehicle/vehiclePose'
import { artefactCacheTile } from '../systems/world/artefactCache'
import { planetParamsFor } from '../systems/world/planetParams'
import { readArtefactReport } from './artefactActions'
import { resetGameStore, useGameStore } from './gameStore'
import { pressAction, releaseAction, resetInput } from './inputRuntime'
import { inputLayerOf } from './presentationSlice'
import { readArtefactChoiceModel, readHudModel } from './screenReads'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'

let sink: MemorySink

beforeEach(() => {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  resetGameStore()
  resetInput()
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

/** The store's run starts on planet 1 of world seed 1. */
const CACHE = artefactCacheTile(planetParamsFor(1, 1))

function tap(action: ActionId): void {
  pressAction(action)
  releaseAction(action)
}

/** The vehicle reports itself on the cache cell, undocked and at rest. */
function driveOntoCache(): void {
  game().freezeEnemies(true)
  game().reportPose({
    x: CACHE.tx * 1000 + 500,
    y: CACHE.ty * 1000 + 500,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.down,
    driving: false,
    thrusting: false,
    drilling: false,
    thrustTicks: 0,
    driveTicks: 0,
    drillTicks: 0,
    drive: NO_DRIVE,
  })
}

const loggedNames = () => sink.events.map((event) => event.event)

describe('the artefact cache from the keyboard (#46)', () => {
  it('shows the cache prompt only while interact would open the cache', () => {
    expect(readHudModel().cachePrompt.isShown).toBe(false)
    driveOntoCache()
    expect(readHudModel().cachePrompt).toEqual({ isShown: true, text: 'Space: Ancient cache' })
  })

  it('opens the three cards on interact, logging artefact_open', () => {
    driveOntoCache()
    tap('interact')
    expect(game().isArtefactChoiceOpen).toBe(true)
    expect(inputLayerOf(game())).toBe('artefact')
    expect(readArtefactChoiceModel().cards.map((card) => card.optionId)).toEqual([
      'artefact.ore_whisper',
      'artefact.breathing_room',
      'artefact.assay_beacon',
    ])
    expect(loggedNames()).toContain('artefact_open')
  })

  it('closes the cards on Escape without a pick, leaving the cache live', () => {
    driveOntoCache()
    tap('interact')
    tap('ui_cancel')
    expect(game().isArtefactChoiceOpen).toBe(false)
    expect(readArtefactReport(game().playerId)).toMatchObject({ cacheState: 'available' })
    tap('interact')
    expect(game().isArtefactChoiceOpen).toBe(true)
  })

  it('never picks on a second press of the open key: focus starts on Leave it', () => {
    driveOntoCache()
    tap('interact')
    tap('ui_confirm')
    expect(game().isArtefactChoiceOpen).toBe(false)
    expect(readArtefactReport(game().playerId)).toMatchObject({ artefactId: null })
  })

  it('takes the focused card for good, closes the cards and logs artefact_chosen once', () => {
    driveOntoCache()
    tap('interact')
    tap('ui_left')
    tap('ui_confirm')
    expect(game().isArtefactChoiceOpen).toBe(false)
    expect(readArtefactReport(game().playerId)).toEqual({
      artefactId: 'artefact.assay_beacon',
      breathingRoomCharges: 0,
      cacheState: 'chosen',
    })
    tap('interact')
    expect(game().isArtefactChoiceOpen).toBe(false)
    expect(readHudModel().cachePrompt.isShown).toBe(false)
    expect(loggedNames().filter((name) => name === 'artefact_chosen')).toHaveLength(1)
  })
})
