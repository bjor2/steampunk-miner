import { describe, expect, it } from 'vitest'
import { DRILL_STAMP_AHEAD_MM, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { CLOSED_CUT_GATE } from '../vehicle/cutGate'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { sweptDrillStampOf } from '../vehicle/drillStamp'
import { pointAtStep, sweepPathOf, sweptStampOf, type SweptCut } from '../vehicle/sweptCut'
import { FACING, type VehiclePose } from '../vehicle/vehiclePose'
import { carveDisc, walkStampInRows } from '../world/groundEdit'
import { stampCellsUpTo, walkStampPerChunk } from '../world/sweptSpan'
import type { StampPoint } from '../world/stampShape'
import type { PlanetParams } from '../world/planetParams'
import { CHUNK_SIZE, chunkOfTile, surfaceRowOfColumn } from '../world/tileGrid'
import { EMPTY_WORLD, isGeneratedChunkHeld, type WorldState } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { cellDigEnergyOf } from './cellDigEnergy'
import type { RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { drillAlongStep } from './drillStepCut'
import { DRILL_CELLS_PER_TICK } from './cutShare'
import { AWAY, onHeatPlanet } from './lava/lavaFixtures'
import { planetParamsOf } from './planetOfState'
import { createScriptedSession, PARAMS, poseAbove, type ScriptedSession } from './scriptedSession'
import { columnSweep, sweepWith } from './sweptSpanFixtures'

// The cut budget at any speed (ticket 335, TD scope b on #316 and the TD lock on #374): the same
// path cut at 1, 4 and 16 m a tick (60, 240 and 960 m/s) opens the same cells per metre, charges
// the same energy per cell, and lays its rings half a metre apart; the report after the steps heats
// for their summed dig time.
//
// Today's drill takes at least 24 ticks a cell (the #7 floor), so no drill moves 16 m a tick: the
// authority runs here cut ground softened to just over its yield, where a sample's dwell under the
// stamp still decides the rim cells. Cells per metre are compared where the #304 law takes the rig,
// a drill that clears every swept sample in its tick, at the world seam through the step's own path
// and the budget's walk.

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
    // The strong drill breaks every cell at the 24-tick floor, so each costs the same.
    const perCell = cellDigEnergyOf(24 * DRILL_SUBSTEPS_PER_TICK)
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

/**
 * On planet 8 at `AWAY`, facing down with a strong drill: the stamp rests for `steps` drill steps,
 * then a report at `reportTick` says it drilled `reportedDrillTicks`.
 */
function restAndReport(
  steps: number,
  reportedDrillTicks: number,
  reportTick = steps,
): ScriptedSession {
  const session = onHeatPlanet()
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 400 } })
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: 1000 },
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
    expect(session.vehicle().sweptCut?.digSubSteps).toBe(broken * 24 * DRILL_SUBSTEPS_PER_TICK)
  })

  it('heats a report for the steps dig time, whatever drill ticks it reports', () => {
    const fromSteps = restAndReport(STEPS, 0).vehicle().heat.level
    expect(restAndReport(STEPS, STEPS).vehicle().heat.level).toBe(fromSteps)
    expect(fromSteps).toBeGreaterThan(restAndReport(0, 0, STEPS).vehicle().heat.level)
  })
})

/** Cells of the 1.9 m stamp swept straight down 30 m, `strideMm` a tick, by a #304-law drill. */
function cellsOpenedWorldAt(strideMm: number): string[] {
  const top = { x: 30_500, y: 261_500 }
  // The stamp leads the pose by the fastest step's bound, so every stride sweeps the same path.
  const aheadMm = DRILL_STAMP_AHEAD_MM + 16_000
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  let world: WorldState = EMPTY_WORLD
  let cursor: SweptCut | undefined
  const opened: string[] = []
  const ticks = Math.ceil((PATH_METRES * 1000) / strideMm)
  for (let tick = 1; tick <= ticks + 1; tick++) {
    const y = top.y - Math.min((tick - 1) * strideMm, PATH_METRES * 1000)
    const pose: VehiclePose = { ...payload, x: top.x, y, facing: FACING.down }
    const stamp = sweptDrillStampOf(pose, false, aheadMm)
    const path = sweepPathOf(cursor, pose, { stamp, aheadMm }, tick)
    const disc = sweptStampOf(path, stamp, path.steps)
    const isPerCell = stampCellsUpTo(disc, new Set(), DRILL_CELLS_PER_TICK) <= DRILL_CELLS_PER_TICK
    const window = { firstTick: tick - 1, ticks: 1, subStepsPerTick: DRILL_SUBSTEPS_PER_TICK }
    const walk = isPerCell ? walkStampInRows : walkStampPerChunk
    const carve = carveDisc(world, PARAMS, disc, window, () => 1, walk)
    world = carve.world
    opened.push(...carve.yielded.map(({ tile }) => `${tile.tx},${tile.ty}`))
    cursor = cursorAt(pointAtStep(path, path.steps), pose, tick)
  }
  return opened.sort()
}

function cursorAt(reached: StampPoint, pose: VehiclePose, tick: number): SweptCut {
  const step = { poseXMm: pose.x, poseYMm: pose.y, facing: pose.facing, tick }
  return { ...reached, ...step, ...CLOSED_CUT_GATE, cutSharePassed: 0, digSubSteps: 0 }
}

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
