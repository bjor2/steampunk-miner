import { describe, expect, it } from 'vitest'
import { BASIS_POINTS, STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { SWEEP_STEP_MM } from '../vehicle/sweptCut'
import { FACING, noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import type { PlanetParams } from '../world/planetParams'
import { CHUNK_SIZE, chunkOfTile, surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import { EMPTY_WORLD, isGeneratedChunkHeld, materialCellAt } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { cellDigEnergyOf } from './cellDigEnergy'
import { withSweptLawCharge } from './cutCarryFixtures'
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
import { poseRidingFront } from './faceHoldFixtures'
import { drillQuantumAt, stepBoundsAt } from './stepBoundRead'
import { sweptColumnAt } from './sweptColumnFixture'
import { columnSweep, sweepWith, WORK_BOUND_DRILL_POWER } from './sweptSpanFixtures'

// The cut budget at any speed (ticket 335, TD scope b on #316 and the TD lock on #374): the same
// path cut at 1, 4 and 16 m a tick (60, 240 and 960 m/s) opens the same cells per metre, charges
// the same energy per cell, and lays its rings half a metre apart; the report after the steps heats
// for their summed dig time. Since ticket 399 the work picks how far each tick cuts, so a pose
// running ahead of it never makes the cut go further; the pose rests at the end while it catches up.
//
// The authority runs here cut ground softened to just over its yield, where a sample's dwell under
// the stamp still decides the rim cells. Cells per metre are compared where the #304 law takes the rig,
// a drill that clears every swept sample in its tick, at the world seam through the step's own path
// and the budget's walk.

/**
 * A cell's drill time under the fixtures' strong drill, in sub-steps: the law's one-sub-step
 * quantum, as there is no tile floor since ticket 397.
 */
const STRONG_SUB_STEPS = 1

/** 1, 4 and 16 m a tick. */
const SPEEDS_M_PER_S = [60, 240, 960]
const PATH_METRES = 30

interface SpeedRun {
  start: AuthorityState
  ticks: RuleEffect[]
}

function cutColumnAt(speed: number, drillPower?: number): SpeedRun {
  const fixture = columnSweep(speed, drillPower)
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

interface Reach {
  tick: number | undefined
  yMm: number | undefined
  carrySubSteps: number | undefined
}

function reachesOf(run: SpeedRun): Reach[] {
  return run.ticks.map(({ state }) => {
    const cursor = vehicleOf(state, 'p1').sweptCut
    return { tick: cursor?.tick, yMm: cursor?.yMm, carrySubSteps: cursor?.carrySubSteps }
  })
}

/** Whether two reaches spent the same work on the same tick, and how far apart they stop. */
function gapOf(reach: Reach, other: Reach): { isSameWork: boolean; yMm: number } {
  const isSameWork = reach.tick === other.tick && reach.carrySubSteps === other.carrySubSteps
  return { isSameWork, yMm: Math.abs((reach.yMm ?? 0) - (other.yMm ?? 0)) }
}

/** Whether a downward cut's cursor at `yMm` stops short of one at `otherYMm` by a sub-step or more. */
function isShortOf(yMm: number | undefined, otherYMm: number | undefined): boolean {
  return (yMm ?? 0) - (otherYMm ?? 0) >= SWEEP_STEP_MM
}

const ringsOf = (run: SpeedRun) => eventsOf(run).filter(({ type }) => type === 'CasingPlaced')

describe('swept cut at any speed (ticket 335)', () => {
  const runs = SPEEDS_M_PER_S.map((speed) => cutColumnAt(speed))

  // The per-cell price is the kill-switch's off path (`drill.sweptLawCharge`, on since 18 Oct 2026).
  it('charges each opened cell its own dig energy at 1, 4 and 16 m a tick, law charge off', () => {
    // The strong drill breaks every cell in one sub-step, so each costs the same.
    const perCell = cellDigEnergyOf(STRONG_SUB_STEPS)
    const perCellRuns = withSweptLawCharge(false, () =>
      SPEEDS_M_PER_S.map((speed) => cutColumnAt(speed)),
    )
    for (const run of perCellRuns) {
      expect(openedCellsOf(run).length).toBeGreaterThanOrEqual(PATH_METRES)
      expect(energySpentBy(run)).toBe(perCell * openedCellsOf(run).length)
    }
  })

  // A drill held under 1 m a tick. The walk stops on its path's sub-steps, which a longer step
  // divides differently, so the cursor may sit up to one sub-step apart; at 4 and 16 m a tick every
  // pose runs ahead of its cut, and the work and the carry it leaves are the same tick for tick. At
  // 1 m a tick the pose stands on the cut for its first ticks, where the cell the carry works toward
  // lies in the body's next step and the stamp bites it too (ticket 421, TD comment 6200703398), so
  // that run is never behind the others and ends where they do.
  it('cuts every tick to where the work reaches, however long the step', () => {
    const workBound = SPEEDS_M_PER_S.map((speed) => cutColumnAt(speed, WORK_BOUND_DRILL_POWER))
    const [slow, workAlone, ...longer] = workBound.map(reachesOf)
    expect(slow.every(({ tick }, index) => tick === workBound[0].start.tick + 1 + index)).toBe(true)
    const common = Math.min(...workBound.map(({ ticks }) => ticks.length))
    for (const reaches of longer) {
      const apart = reaches.slice(0, common).map((reach, index) => gapOf(reach, workAlone[index]))
      expect(apart.filter((gap) => !gap.isSameWork || gap.yMm >= SWEEP_STEP_MM)).toEqual([])
    }
    const behind = slow.slice(0, common).filter(({ yMm }, at) => isShortOf(yMm, workAlone[at].yMm))
    expect(behind).toEqual([])
    const lastCursor = vehicleOf(lastStateOf(workBound[workBound.length - 1]), 'p1').sweptCut
    expect(lastCursor?.yMm).toBe(vehicleOf(lastStateOf(workBound[0]), 'p1').sweptCut?.yMm)
  })

  it('lays the same rings along the same path at 1, 4 and 16 m a tick', () => {
    const [slow, ...faster] = runs.map((run) => ringsOf(run).length)
    expect(slow).toBeGreaterThanOrEqual(2 * PATH_METRES - 6)
    for (const rings of faster) expect(Math.abs(rings - slow)).toBeLessThanOrEqual(1)
  })
})

/** A drill that breaks planet 8's rock in one sub-step a cell. */
const STRONG_DRILL_STEP = 54

/**
 * A drill that takes about 23 ticks a cell of planet 8's rock, so the cells under a resting stamp
 * keep it digging through a 40-tick report interval: the report is never left idle time to cool.
 */
const SLOW_DRILL_STEP = 28

/**
 * On planet 8 at `AWAY`, facing down with a drill at `drillStep`: the body rides its cut down for
 * `steps` drill steps (ticket 570: a resting body's cut stops once its step is cut), then a report
 * at `reportTick` says it drilled `reportedDrillTicks`.
 */
function restAndReport(
  steps: number,
  reportedDrillTicks: number,
  reportTick = steps,
  drillStep = STRONG_DRILL_STEP,
): ScriptedSession {
  const session = onHeatPlanet()
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 400 } })
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: drillStep },
  })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '100000' } })
  session.submit(0, reportDownAt(0))
  let body: { x: number; y: number } = AWAY
  for (let tick = 1; tick <= steps; tick++) {
    session.submit(tick, {
      type: 'drillStep',
      payload: { ...body, facing: FACING.down, drive: NO_DRIVE },
    })
    const pose = { ...(session.vehicle().pose as VehiclePose), ...body, facing: FACING.down }
    body = poseRidingFront(pose, session.vehicle().sweptCut)
  }
  session.submit(reportTick, reportDownAt(reportedDrillTicks))
  return session
}

function reportDownAt(drillTicks: number) {
  const { type, payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down, { drillTicks })
  return { type, payload: { ...payload, ...AWAY } }
}

/** The broken cells' own drill times in sub-steps, read on the ground as generated. */
function digSubStepsOf(session: ScriptedSession, broken: readonly TilePoint[]): number {
  const state = session.state()
  const params = planetParamsOf(state.planet) as PlanetParams
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, 'p1'))
  const quantum = drillQuantumAt(state, 'p1')
  const subStepsOf = drillSubStepsOfCells(params, drill, shockTicksFor(state, 'p1'), quantum)
  return broken.reduce(
    (sum, tile) => sum + (subStepsOf(tile, materialCellAt(EMPTY_WORLD, params, tile), 0) ?? 0),
    0,
  )
}

describe('heat from the steps summed dig time (ticket 335, TD lock on #374)', () => {
  const STEPS = 40

  it('sums the dig time of the cells the steps broke on the cursor', () => {
    const session = restAndReport(STEPS, 0)
    const broken = session
      .events()
      .flatMap((event) => (event.type === 'TileDestroyed' ? [{ tx: event.tx, ty: event.ty }] : []))
    expect(broken.length).toBeGreaterThan(0)
    expect(session.vehicle().sweptCut?.digSubSteps).toBe(digSubStepsOf(session, broken))
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
    session.submit(1, {
      type: 'drillStep',
      payload: { ...start, facing: FACING.down, drive: NO_DRIVE },
    })
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

/**
 * The ticks the rig's strides keep its pose above planet 40's core, at most 240. Past the old
 * one-sub-step floor (ticket 558) a stride is the planet's radius, and a pose driven on past the
 * cut's end lengthens the path every tick walks.
 */
function ticksAboveTheCoreOf(start: { params: PlanetParams; top: VehiclePose }, stepMm: number) {
  const coreTopMm = start.params.coreRadiusTiles * 1000
  return Math.max(1, Math.min(240, Math.floor((start.top.y - coreTopMm) / stepMm)))
}

describe('energy per cell on planet 40 at the rig cut speed (ticket 335, Vertical Scaler)', () => {
  // The per-cell price is the kill-switch's off path (`drill.sweptLawCharge`, on since 18 Oct 2026).
  it('charges within 1% of each broken cell at its own dig time, law charge off', () =>
    withSweptLawCharge(false, chargesWithinOnePercent))

  function chargesWithinOnePercent() {
    const start = onPlanet40()
    const stepMm = stepBoundsAt(start.state, 'p1').cuttingMm - STEP_BOUND_TOLERANCE_MM
    let state = start.state
    const broken: { tx: number; ty: number }[] = []
    for (let tick = 1; tick <= ticksAboveTheCoreOf(start, stepMm); tick++) {
      const pose = { ...start.top, y: start.top.y - stepMm * tick }
      const step = { pose, drive: NO_DRIVE, isLifting: false }
      const effect = drillAlongStep({ ...state, tick }, start.params, 'p1', noseTileOf(pose), step)
      effect.events.forEach((event) => event.type === 'TileDestroyed' && broken.push(event))
      state = effect.state
    }
    const drill = heatThrottledDrill(start.params.planetIndex, vehicleOf(state, 'p1'))
    const quantum = drillQuantumAt(state, 'p1')
    const shock = shockTicksFor(state, 'p1')
    const subStepsOf = drillSubStepsOfCells(start.params, drill, shock, quantum)
    const reference = broken.reduce((sum, tile) => {
      const cell = materialCellAt(EMPTY_WORLD, start.params, tile)
      return sum + cellDigEnergyOf(subStepsOf(tile, cell, 0) ?? 0, BASIS_POINTS, quantum)
    }, 0)
    const spent = vehicleOf(start.state, 'p1').energy - vehicleOf(state, 'p1').energy
    expect(broken.length).toBeGreaterThanOrEqual(10)
    expect(Math.abs(spent / reference - 1)).toBeLessThanOrEqual(0.01)
  }
})
