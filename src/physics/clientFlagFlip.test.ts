import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createVehicleLoop, type VehicleLoop } from '../scene/vehicleLoop'
import { readLocalVehicle, resetGameStore, useGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
} from './vehicleController'

// The client loop reads its dev flags from the store at every fixed step (ticket 548, the TD
// ruling on #547 section 2): a `drill.sweptCut` flip made mid-drill stays pending, the swept
// steps going on, until a step finds the drill idle; from then the drill cuts on pose reports.

const RIG = { drill_power: 4, drill_tip: 600, engine: 17 }
const ticksOf = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

let sink: MemorySink

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

/** The store's loop on a fresh world, the rig on the dock with `RIG` bought. */
function createStoreFlagRig() {
  Object.entries(RIG).forEach(([track, level]) => game().setUpgrade(track, level))
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const controller = createVehicleController(RAPIER, world, createVehicleBody(RAPIER, world, start))
  return { controller, loop: createVehicleLoop() }
}

/** Holds `intent` for `ticks`; the command types the loop sent meanwhile. */
function hold(
  rig: { controller: VehicleController; loop: VehicleLoop },
  intent: VehicleIntent,
  ticks: number,
): string[] {
  const from = sink.commands.length
  for (let tick = 0; tick < ticks; tick++) {
    if (tick % 60 === 0) game().setEnergy('150')
    rig.loop.step(rig.controller, intent)
    rig.controller.stepWorld()
  }
  return sink.commands.slice(from).map((command) => command.type)
}

describe('the client dev flags in the fixed-step loop (ticket 548)', () => {
  it('holds a drill.sweptCut flip made mid-drill until the drill is idle, then applies it', () => {
    const rig = createStoreFlagRig()
    hold(rig, buildIntent(['aim_left']), ticksOf(2))
    expect(hold(rig, buildIntent(['aim_down']), ticksOf(1))).toContain('drillStep')

    game().setDevFlags({ 'drill.sweptCut': false })
    const stillSwept = hold(rig, buildIntent(['aim_down']), ticksOf(0.5))
    expect(stillSwept).toContain('drillStep')
    expect(game().clientDevFlags.pending).toEqual({ 'drill.sweptCut': false })

    hold(rig, IDLE_INTENT, ticksOf(0.5))
    expect(game().clientDevFlags.pending).toEqual({})
    expect(game().clientDevFlags.flags['drill.sweptCut']).toBe(false)

    const reported = hold(rig, buildIntent(['aim_down']), ticksOf(1))
    expect(reported).not.toContain('drillStep')
    expect(reported).toContain('reportPose')
  })
})
