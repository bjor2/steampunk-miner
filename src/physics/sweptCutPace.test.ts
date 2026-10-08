import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { ECONOMY } from '../systems/economy/economy'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'

// The swept cut in the real fixed-step loop (ticket 330 acceptance, Vertical Scaler on #316): with
// `drill.sweptCut` on and the drill held at its floor (drill and engine far past the curve, the
// tank refilled), the vehicle digs down and level faster than the 5 Hz report's cut and its wheels
// never wait on the cut past a report interval. The speeds are logged, not gated. The floor is
// `economy.json`'s `minTicksPerTile`; the 8-tick run swaps it in on a fresh module graph with no
// slices registered (a kernel spec never imports one), as `store/authorityReads.test.ts` does.

/** Steps past the curve, as the TD's #316 runs: the drill bound by the floor, speedMax ~14. */
const FLOOR_BOUND_LEVELS = { drill_power: 2000, drill_tip: 600, engine: 5000 } as const
const SECONDS = 6
/** The steady rate is read over the last half of each run. */
const STEADY_FROM_SECONDS = 3

interface Run {
  /** Metres a second down, then along the level tunnel, over the steady half. */
  down: number
  level: number
  /** The longest run of steps the body stood still in the level leg's last second. */
  longestLevelWaitTicks: number
}

async function playFloorBound(minTicksPerTile: number, isSwept: boolean): Promise<Run> {
  vi.resetModules()
  vi.doMock('../systems/economy/economy', () => ({
    ECONOMY: { ...ECONOMY, drill: { ...ECONOMY.drill, minTicksPerTile } },
  }))
  // The artefact offers first: on a fresh graph the icon set otherwise meets them half-loaded.
  await import('../systems/registries/artefactOptions')
  ;(await import('../registries/registrar')).loadSlices([])
  const runLog = await import('../logging/runLog')
  const store = await import('../store/gameStore')
  const { createVehicleLoop } = await import('../scene/vehicleLoop')
  const { createVehicleBody, createVehicleController } = await import('./vehicleController')
  const { buildIntent } = await import('../systems/input/buildIntent')
  store.resetGameStore()
  const log = { runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }
  runLog.installRunLog(runLog.createRunLog(log))
  const game = store.useGameStore.getState()
  for (const [track, level] of Object.entries(FLOOR_BOUND_LEVELS)) game.setUpgrade(track, level)
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = store.readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const body = createVehicleBody(RAPIER, world, start)
  const controller = createVehicleController(RAPIER, world, body)
  const loop = createVehicleLoop({ 'drill.sweptCut': isSwept })
  const hold = (intent: VehicleIntent, seconds: number, each?: () => void) => {
    for (let step = 0; step < Math.round(seconds / PHYSICS_TIMESTEP); step++) {
      if (step % 60 === 0) store.useGameStore.getState().setEnergy('150')
      loop.step(controller, intent)
      world.step()
      each?.()
    }
  }
  const rateWhile = (intent: VehicleIntent, along: () => number) => {
    hold(intent, STEADY_FROM_SECONDS)
    const from = along()
    hold(intent, SECONDS - STEADY_FROM_SECONDS)
    return (along() - from) / (SECONDS - STEADY_FROM_SECONDS)
  }
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  hold(buildIntent(['aim_left']), 2)
  const down = rateWhile(buildIntent(['aim_down']), () => -body.translation().y)
  const waits = { current: 0, longest: 0, lastX: body.translation().x }
  const noteWait = () => {
    const x = body.translation().x
    waits.current = Math.abs(x - waits.lastX) < 0.001 ? waits.current + 1 : 0
    waits.longest = Math.max(waits.longest, waits.current)
    waits.lastX = x
  }
  const level = rateWhile(buildIntent(['aim_left']), () => -body.translation().x)
  hold(buildIntent(['aim_left']), 1, noteWait)
  runLog.uninstallRunLog()
  return { down, level, longestLevelWaitTicks: waits.longest }
}

beforeAll(async () => {
  await RAPIER.init()
})

describe('swept cut in the live loop (ticket 330)', () => {
  // The speeds are logged for the re-baseline; the gate is that the cut keeps up: it never stalls
  // the wheels past a report interval, and it digs faster than the 5 Hz per-report cut.
  it.each([24, 8])(
    'digs faster than the per-report cut and never stalls at the %i-tick floor',
    async (floor) => {
      const swept = await playFloorBound(floor, true)
      const reported = await playFloorBound(floor, false)
      console.log(`swept cut, ${floor}-tick floor: ${JSON.stringify({ swept, reported })}`)
      expect(swept.down).toBeGreaterThan(reported.down)
      expect(swept.level).toBeGreaterThan(reported.level)
      expect(swept.longestLevelWaitTicks).toBeLessThanOrEqual(12)
    },
    180_000,
  )
})
