import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK, STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import { ECONOMY } from '../economy/economy'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import type { PlanetParams } from '../world/planetParams'
import { CHUNK_SIZE, chunkOfTile, surfaceRowOfColumn } from '../world/tileGrid'
import { EMPTY_WORLD, isGeneratedChunkHeld, materialCellAt } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { cellDigEnergyOf } from './cellDigEnergy'
import type { RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { drillAlongStep } from './drillStepCut'
import { AWAY, onHeatPlanet } from './lava/lavaFixtures'
import { planetParamsOf } from './planetOfState'
import { drillSubStepsOfCells } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  poseAbove,
  type ScriptedSession,
} from './scriptedSession'
import { stepBoundsAt } from './stepBoundRead'
import { sweptColumnAt } from './sweptColumnFixture'
import { columnSweep, sweepWith } from './sweptSpanFixtures'

// The cut budget at any speed (ticket 335, TD scope b on #316 and the TD lock on #374): the same
// path cut at 1, 4 and 16 m a tick (60, 240 and 960 m/s) opens the same cells per metre, charges
// the same energy per cell, and lays its rings half a metre apart; the report after the steps heats
// for their summed dig time.
//
// Today's drill takes at least 4 ticks a cell (ticket 396's stopgap floor), so no drill moves 16 m a tick: the
// authority runs here cut ground softened to just over its yield, where a sample's dwell under the
// stamp still decides the rim cells. Cells per metre are compared where the #304 law takes the rig,
// a drill that clears every swept sample in its tick, at the world seam through the step's own path
// and the budget's walk.

/** A cell's drill time at the tile floor, in sub-steps. */
const FLOOR_SUB_STEPS = ECONOMY.drill.minTicksPerTile * DRILL_SUBSTEPS_PER_TICK

/** 1, 4 and 16 m a tick. */
const SPEEDS_M_PER_S = [60, 240, 960]
const PATH_METRES = 30

interface SpeedRun {
  start: AuthorityState
  ticks: RuleEffect[]
}

function cutColumnAt(speed: number): SpeedRun {
  const fixture = columnSweep(speed)
  return { start: fixture.start(), ticks: sweepWith(fixture, drillAlongStep, (effect) => effect) }
}

const eventsOf = ({ ticks }: SpeedRun): DomainEventBody[] => ticks.flatMap(({ events }) => events)
const lastStateOf = ({ ticks }: SpeedRun): AuthorityState => ticks[ticks.length - 1].state

function openedCellsOf(run: SpeedRun): string[] {
  const opened = eventsOf(run).flatMap((event) =>
    event.type === 'TileDestroyed' ? [`${event.tx},${event.ty}`] : [],
  )
  return opened.sort()
}

function energySpentBy(run: SpeedRun): number {
  return vehicleOf(run.start, 'p1').energy - vehicleOf(lastStateOf(run), 'p1').energy
}

const ringsOf = (run: SpeedRun) => eventsOf(run).filter(({ type }) => type === 'CasingPlaced')

describe('swept cut at any speed (ticket 335)', () => {
  const runs = SPEEDS_M_PER_S.map(cutColumnAt)

  it('charges each opened cell its own dig energy at 1, 4 and 16 m a tick', () => {
    // The strong drill breaks every cell at the tile floor, so each costs the same.
    const perCell = cellDigEnergyOf(FLOOR_SUB_STEPS)
    for (const run of runs) {
      expect(openedCellsOf(run).length).toBeGreaterThanOrEqual(PATH_METRES)
      expect(energySpentBy(run)).toBe(perCell * openedCellsOf(run).length)
    }
  })

  it('cuts every tick to the stamp, however long the step', () => {
    for (const run of runs) {
      const cursors = run.ticks.map(({ state }) => vehicleOf(state, 'p1').sweptCut)
      expect(cursors.every((cursor, index) => cursor?.tick === run.start.tick + 1 + index)).toBe(
        true,
      )
    }
    const fastest = runs[runs.length - 1]
    const lastCursor = vehicleOf(lastStateOf(fastest), 'p1').sweptCut
    const slowCursor = vehicleOf(lastStateOf(runs[0]), 'p1').sweptCut
    expect(lastCursor?.yMm).toBe(slowCursor?.yMm)
  })

  it('lays the same rings along the same path at 1, 4 and 16 m a tick', () => {
    const [slow, ...faster] = runs.map((run) => ringsOf(run).length)
    expect(slow).toBeGreaterThanOrEqual(2 * PATH_METRES - 6)
    for (const rings of faster) expect(Math.abs(rings - slow)).toBeLessThanOrEqual(1)
  })
})

/** A drill that breaks planet 8's rock at the tile floor. */
const FLOOR_DRILL_STEP = 1000

/**
 * A drill that takes about 23 ticks a cell of planet 8's rock, so the cells under a resting stamp
 * keep it digging through a 40-tick report interval: the report is never left idle time to cool.
 */
const SLOW_DRILL_STEP = 510

/**
 * On planet 8 at `AWAY`, facing down with a drill at `drillStep`: the stamp rests for `steps` drill
 * steps, then a report at `reportTick` says it drilled `reportedDrillTicks`.
 */
function restAndReport(
  steps: number,
  reportedDrillTicks: number,
  reportTick = steps,
  drillStep = FLOOR_DRILL_STEP,
): ScriptedSession {
  const session = onHeatPlanet()
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 400 } })
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: drillStep },
  })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '100000' } })
  session.submit(0, reportDownAt(0))
  for (let tick = 1; tick <= steps; tick++) {
    session.submit(tick, { type: 'drillStep', payload: { ...AWAY, drive: NO_DRIVE } })
  }
  session.submit(reportTick, reportDownAt(reportedDrillTicks))
  return session
}

function reportDownAt(drillTicks: number) {
  const { type, payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down, { drillTicks })
  return { type, payload: { ...payload, ...AWAY } }
}

describe('heat from the steps summed dig time (ticket 335, TD lock on #374)', () => {
  const STEPS = 40

  it('sums the dig time of the cells the steps broke on the cursor', () => {
    const session = restAndReport(STEPS, 0)
    const broken = session.events().filter(({ type }) => type === 'TileDestroyed').length
    expect(broken).toBeGreaterThan(0)
    expect(session.vehicle().sweptCut?.digSubSteps).toBe(broken * FLOOR_SUB_STEPS)
  })

  it('heats a report for the steps dig time, whatever drill ticks it reports', () => {
    const fromSteps = restAndReport(STEPS, 0, STEPS, SLOW_DRILL_STEP).vehicle().heat.level
    const reported = restAndReport(STEPS, STEPS, STEPS, SLOW_DRILL_STEP).vehicle().heat.level
    expect(reported).toBe(fromSteps)
    const unstepped = restAndReport(0, 0, STEPS, SLOW_DRILL_STEP).vehicle().heat.level
    expect(fromSteps).toBeGreaterThan(unstepped)
  })
})

/** Cells of the 1.9 m stamp swept straight down 30 m, `strideMm` a tick, by a #304-law drill. */
const cellsOpenedWorldAt = (strideMm: number) => sweptColumnAt(strideMm, PATH_METRES).opened

describe('cells per metre along the same path at any speed (ticket 335)', () => {
  it('opens the same cells at 1, 4 and 16 m a tick when the drill clears each tick', () => {
    const [slow, ...faster] = [1_000, 4_000, 16_000].map(cellsOpenedWorldAt)
    // The bare 1.9 m bore opens about 2 cells a metre (#316).
    expect(slow.length).toBeGreaterThanOrEqual(PATH_METRES + PATH_METRES / 2)
    for (const opened of faster) expect(opened).toEqual(slow)
  })
})

describe('authority prefetch along the drive (ticket 335)', () => {
  it('generates the chunk one chunk ahead of the cut, facing down', () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.setPlanetSeed', payload: { planetSeed: 31415 } })
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
    const params = planetParamsOf(session.state().planet) as PlanetParams
    const column = 20
    const start = {
      x: column * 1000 + 500,
      y: (surfaceRowOfColumn(column, params.radiusTiles) + 3) * 1000,
    }
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
    session.submit(0, { type: 'reportPose', payload: { ...payload, ...start } })
    const below = chunkOfTile(Math.floor(start.y / 1000) - 2 * CHUNK_SIZE + 4)
    const cx = chunkOfTile(column)
    expect(isGeneratedChunkHeld(params, cx, below)).toBe(false)
    session.submit(1, { type: 'drillStep', payload: { ...start, drive: NO_DRIVE } })
    const reach = session.vehicle().sweptCut?.yMm ?? 0
    const ahead = chunkOfTile(Math.floor((reach - CHUNK_SIZE * 1000) / 1000))
    expect(isGeneratedChunkHeld(params, cx, ahead)).toBe(true)
  })
})

/** A strong rig on planet 40 over column 20, facing down, its enemies frozen. */
function onPlanet40(): { state: AuthorityState; params: PlanetParams; top: VehiclePose } {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: 40 } })
  session.submit(0, FREEZE_ENEMIES)
  for (const upgradeId of ['drill_tip', 'drill_power']) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level: 3000 } })
  }
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '100000000' } })
  const params = planetParamsOf(session.state().planet) as PlanetParams
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  const y = (surfaceRowOfColumn(20, params.radiusTiles) - 2) * 1000 + 500
  session.submit(0, { type: 'reportPose', payload: { ...payload, x: 20_500, y } })
  return {
    state: session.state(),
    params,
    top: vehicleOf(session.state(), 'p1').pose as VehiclePose,
  }
}

describe('energy per cell on planet 40 at the rig cut speed (ticket 335, Vertical Scaler)', () => {
  it('charges within 1% of each broken cell at its own dig time', () => {
    const start = onPlanet40()
    const stepMm = stepBoundsAt(start.state, 'p1').cuttingMm - STEP_BOUND_TOLERANCE_MM
    let state = start.state
    const broken: { tx: number; ty: number }[] = []
    for (let tick = 1; tick <= 240; tick++) {
      const pose = { ...start.top, y: start.top.y - stepMm * tick }
      const step = { pose, drive: NO_DRIVE, isLifting: false }
      const effect = drillAlongStep({ ...state, tick }, start.params, 'p1', noseTileOf(pose), step)
      effect.events.forEach((event) => event.type === 'TileDestroyed' && broken.push(event))
      state = effect.state
    }
    const drill = heatThrottledDrill(start.params.planetIndex, vehicleOf(state, 'p1'))
    const subStepsOf = drillSubStepsOfCells(start.params, drill, shockTicksFor(state, 'p1'))
    const reference = broken.reduce((sum, tile) => {
      const cell = materialCellAt(EMPTY_WORLD, start.params, tile)
      return sum + cellDigEnergyOf(subStepsOf(tile, cell, 0) ?? 0)
    }, 0)
    const spent = vehicleOf(start.state, 'p1').energy - vehicleOf(state, 'p1').energy
    expect(broken.length).toBeGreaterThanOrEqual(10)
    expect(Math.abs(spent / reference - 1)).toBeLessThanOrEqual(0.01)
  })
})
