import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { KeyChange } from '../shell/shell'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { resetInput, routeKeyChange } from '../store/inputRuntime'
import type { VehicleStaging } from '../systems/registries/vehicleStaging'
import { buildIntent } from '../systems/input/buildIntent'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import { createVehicleStage, turnStagedVehicle, vehicleStagePresence } from './vehicleStage'

/** A fake dock building that stages every docked vehicle the same way. */
const STAGED: VehicleStaging = {
  drawOffsetX: 1.5,
  drawOffsetY: 0,
  cameraX: 7,
  cameraY: 301.8,
  cameraWeight: 1,
  isHoldingInput: true,
  canLeaveByDriveHold: true,
}

const fakeBuilding: SliceDefinition = {
  id: 'fake-building',
  register(r) {
    r.vehicleStaging({
      id: 'fake-building.stage',
      stagingOf: (state, playerId) =>
        state.players[playerId].vehicle.mode === 'docked' ? STAGED : null,
    })
  },
}

/** The same building with its own turntable turned half a radian (#180). */
const turnedBuilding: SliceDefinition = {
  id: 'fake-building',
  register(r) {
    r.vehicleStaging({
      id: 'fake-building.stage',
      stagingOf: (state, playerId) =>
        state.players[playerId].vehicle.mode === 'docked' ? { ...STAGED, rotation: 0.5 } : null,
    })
  },
}

const key = (code: string, isDown: boolean): KeyChange => ({
  code,
  isDown,
  isRepeat: false,
  isShiftHeld: false,
})

const game = () => useGameStore.getState()

function stepTimes(count: number, stage = createVehicleStage()) {
  let intent = buildIntent(['aim_right'])
  for (let step = 0; step < count; step++) {
    game().advanceOneTick()
    intent = stage.step(buildIntent(['aim_right']))
  }
  return intent
}

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  resetGameStore()
  resetInput()
  turnStagedVehicle(0)
})

afterEach(() => uninstallRunLog())

describe('vehicle stage', () => {
  it('stages nothing and passes the intent through with no provider registered', () => {
    game().dock('sell')
    const intent = withRegistrations([], () => stepTimes(1))
    expect(intent).toEqual(buildIntent(['aim_right']))
    expect(vehicleStagePresence.drawOffsetX).toBe(0)
    expect(vehicleStagePresence.cameraWeight).toBe(0)
  })

  it('hands the staging to the scene and drives with the idle intent while it holds input', () => {
    game().dock('sell')
    const intent = withRegistrations([fakeBuilding], () => stepTimes(1))
    expect(intent).toEqual(IDLE_INTENT)
    expect(vehicleStagePresence).toEqual({
      drawOffsetX: 1.5,
      drawOffsetY: 0,
      cameraX: 7,
      cameraY: 301.8,
      cameraWeight: 1,
      rotation: 0,
    })
  })

  it("turns the staged car by the slice's turn on top of the provider's own rotation", () => {
    game().dock('sell')
    turnStagedVehicle(1.25)
    withRegistrations([turnedBuilding], () => stepTimes(1))
    expect(vehicleStagePresence.rotation).toBe(1.75)
  })

  it('draws the car unturned while nothing stages it, whatever a slice asked', () => {
    game().dock('sell')
    turnStagedVehicle(1.25)
    withRegistrations([], () => stepTimes(1))
    expect(vehicleStagePresence.rotation).toBe(0)
  })

  it('drops the turn when the staging ends, so the next visit starts as driven', () => {
    game().dock('sell')
    withRegistrations([fakeBuilding], () => {
      const stage = createVehicleStage()
      turnStagedVehicle(Math.PI)
      stepTimes(1, stage)
      expect(vehicleStagePresence.rotation).toBe(Math.PI)
      game().undock()
      stepTimes(1, stage)
      game().dock('sell')
      stepTimes(1, stage)
    })
    expect(vehicleStagePresence.rotation).toBe(0)
  })

  it('undocks once a drive key has been held for 15 ticks where the staging allows it', () => {
    game().dock('sell')
    routeKeyChange(key('KeyD', true))
    withRegistrations([fakeBuilding], () => {
      const stage = createVehicleStage()
      stepTimes(14, stage)
      expect(game().vehicle.mode).toBe('docked')
      stepTimes(1, stage)
    })
    expect(game().vehicle.mode).toBe('active')
  })

  it('keeps the vehicle docked when the drive key is let go before 15 ticks', () => {
    game().dock('sell')
    withRegistrations([fakeBuilding], () => {
      const stage = createVehicleStage()
      routeKeyChange(key('KeyD', true))
      stepTimes(10, stage)
      routeKeyChange(key('KeyD', false))
      stepTimes(10, stage)
    })
    expect(game().vehicle.mode).toBe('docked')
  })
})
