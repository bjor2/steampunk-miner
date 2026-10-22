import { describe, expect, it } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { withRegistrations } from '../../registries/registrar'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, noseTileOf, tileOfMillimetres, type VehiclePose } from '../vehicle/vehiclePose'
import { cargoUnitsOf, statsOfVehicle } from '../vehicle/vehicleState'
import { cellDensitySum } from '../world/cellYield'
import type { PlanetParams } from '../world/planetParams'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../world/sampleGrid'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { materialCellAt } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { toCanonicalJson } from './canonicalJson'
import type { RuleEffect } from './commandRule'
import { drillAlongStep } from './drillStepCut'
import { poseRidingFront } from './faceHoldFixtures'
import { drillSubStepsOfCells } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import { planetParamsOf } from './planetOfState'
import { coreTiles, createScriptedSession, FREEZE_ENEMIES, poseAbove } from './scriptedSession'
import { drillAlongSweep, type SweptStep } from './sweptDrill'
import { coreSweep, ELECTRIFIED, fullHoldSweep, PREFILLED, sweepWith } from './sweptSpanFixtures'
import { drillAlongSpan } from './sweptSpanDrill'
import { movingDownAtCutSpeed } from './sweptRigFixtures'

// The exact drill carry through the authority (ticket 399, the TD ruling on #399): a tick's work
// and the cursor's carry pay the cells the stamp's centre crosses, so over a column the cut takes
// exactly the sum of the cells' drill times; the live walk (per cell within the share, in runs and
// the span over it) cuts the same bytes as the per-cell walk at any speed, and the carry drops to 0
// where #7's core, hazards and an empty tank end a tick's walk.

const Q = DRILL_SUBSTEPS_PER_TICK
const COLUMN = 30
const CELLS = 100

/** A rig on `planetIndex` at its column 30, 40 tiles under the surface, facing down. */
function rigInColumn(levels: Record<string, number>, energy: string, planetIndex = 1) {
  const session = createScriptedSession()
  if (planetIndex !== 1) session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(0, FREEZE_ENEMIES)
  for (const [upgradeId, level] of Object.entries(levels)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit(0, { type: 'debug.setEnergy', payload: { energy } })
  const params = planetParamsOf(session.state().planet) as PlanetParams
  const y = (surfaceRowOfColumn(COLUMN, params.radiusTiles) - 40) * 1000 + 500
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  // Already cutting down at the law's speed (#724: from rest the ramp would set the pace).
  const moving = movingDownAtCutSpeed(session.state(), payload)
  session.submit(0, {
    type: 'reportPose',
    payload: { ...payload, x: COLUMN * 1000 + 500, y, ...moving },
  })
  const state = session.state()
  return { state, params, top: vehicleOf(state, 'p1').pose as VehiclePose }
}

interface Rig {
  state: AuthorityState
  params: PlanetParams
  top: VehiclePose
}

/** The body up to `strideMm` further down, riding the cut's front (ticket 570). */
function downIntoOpenGround(state: AuthorityState, pose: VehiclePose, strideMm: number) {
  const riding = poseRidingFront(pose, vehicleOf(state, 'p1').sweptCut)
  return { x: pose.x, y: Math.max(pose.y - strideMm, Math.min(pose.y, riding.y)) }
}

type StepCut = (
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  target: TilePoint,
  step: SweptStep,
) => RuleEffect

/**
 * The rig's cut, a tick at a time: resting at its start, then its pose up to `strideMm` further
 * down, into the ground the cut opened (ticket 570: the cut rides the body's face).
 */
function cutDown(rig: Rig, cut: StepCut, { strideMm, ticks }: { strideMm: number; ticks: number }) {
  let state = rig.state
  let pose = rig.top
  const effects: RuleEffect[] = []
  for (let tick = 1; tick <= ticks; tick++) {
    if (tick > 1) pose = { ...pose, ...downIntoOpenGround(state, pose, strideMm) }
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    const ticked = { ...state, tick: rig.state.tick + tick }
    const effect = cut(ticked, rig.params, 'p1', noseTileOf(pose), step)
    effects.push(effect)
    state = effect.state
  }
  return effects
}

/**
 * A drill at about the old 4-tick floor's speed on planet 1 (stored step 200, some 250 sub-steps a
 * band-1 cell, since ticket 397 took the floor out of the law), a hold that never fills and a deep
 * tank.
 */
const QUICK_RIG = { drill_power: 12, drill_tip: 400, cargo_hold: 51 }

/** The tick each of the column's cells broke, from the top cell down, relative to the first tick. */
function brokenTicksOf(ticks: readonly RuleEffect[], cells: readonly TilePoint[]): number[] {
  return cells.map((cell) =>
    ticks.findIndex(({ events }) =>
      events.some(
        (event) => event.type === 'TileDestroyed' && event.tx === cell.tx && event.ty === cell.ty,
      ),
    ),
  )
}

/**
 * The first 100 cells the drill can cut that the stamp's centre crosses going down the column,
 * below the body's own cell (the walk never prices a path's start).
 */
function columnCellsBelow({ state, params, top }: Rig): TilePoint[] {
  const cells: TilePoint[] = []
  for (let ty = Math.floor(top.y / 1000) - 1; cells.length < CELLS; ty--) {
    const tile = { tx: COLUMN, ty }
    if (isRemovableCell(materialCellAt(state.world, params, tile))) cells.push(tile)
  }
  return cells
}

/** The column's cells down to the first gap in it: a cave or an open cell. */
function solidRunOf(cells: readonly TilePoint[]): TilePoint[] {
  const gap = cells.findIndex((cell, at) => at > 0 && cells[at - 1].ty - cell.ty !== 1)
  return cells.slice(0, gap < 0 ? cells.length : gap)
}

/** What each crossed cell costs at the start: its drill time times its uncut share, rounded up. */
function pricesOf(state: AuthorityState, params: PlanetParams, cells: readonly TilePoint[]) {
  const drill = heatThrottledDrill(params.planetIndex, vehicleOf(state, 'p1'))
  const subStepsOf = drillSubStepsOfCells(params, drill, shockTicksFor(state, 'p1'))
  return cells.map((tile) => {
    const full = subStepsOf(tile, materialCellAt(state.world, params, tile), 0) ?? 0
    const uncut = cellDensitySum(state.world, params, tile)
    return Math.ceil((full * uncut) / (SAMPLES_PER_CELL * SOLID_DENSITY))
  })
}

describe('drill carry through the authority (ticket 399)', () => {
  // Over the column's solid run above its first cave: since ticket 570 a cave is crossed at the
  // body's own speed, the work of the ticks it takes banked only up to the next cell's price.
  it("cuts a column's solid run in exactly the sum of its cells drill times", () => {
    const rig = rigInColumn(QUICK_RIG, '100000000')
    const cells = solidRunOf(columnCellsBelow(rig))
    expect(cells.length).toBeGreaterThanOrEqual(20)
    const prices = pricesOf(rig.state, rig.params, cells)
    const spare = Math.ceil(prices.reduce((sum, price) => sum + price, 0) / Q) + 1
    // The body follows the cut down its face (ticket 570): the front bites into each cell as far as
    // the work pays and the walk pays the rest as the stamp's centre enters it, so each cell is
    // paid in full, the cursor standing in it, on the tick the running total of prices is spent.
    const ticks = cutDown(rig, drillAlongStep, { strideMm: 40_000, ticks: spare })
    let total = 0
    const expected = prices.map((price) => Math.ceil((total += price) / Q) - 1)
    expect(enteredTicksOf(ticks, cells)).toEqual(expected)
    expect(
      brokenTicksOf(ticks, cells).every((tick, at) => tick >= 0 && tick <= expected[at] + 1),
    ).toBe(true)
  })

  // Planet 40's rig at the cut speed bound's reach, then 10 and 100 times it (Vertical Scaler).
  it.each([5_000, 50_000, 500_000])(
    'cuts the same bytes live, in runs and as the span, as per cell, %i mm a tick on planet 40',
    (strideMm) => {
      const rig = rigInColumn({ drill_power: 158, drill_tip: 3000 }, '100000000', 40)
      const live = cutDown(rig, drillAlongStep, { strideMm, ticks: 40 })
      const perCell = cutDown(rig, drillAlongSweep, { strideMm, ticks: 40 })
      const span = cutDown(rig, (...cut) => drillAlongSpan(...cut).effect, {
        strideMm,
        ticks: 40,
      })
      const canonical = (ticks: readonly RuleEffect[]) => ticks.map(toCanonicalJson)
      expect(canonical(live)).toEqual(canonical(perCell))
      expect(canonical(span)).toEqual(canonical(perCell))
      const broken = perCell.flatMap(({ events }) => events.filter(isDestroyed))
      expect(broken.length).toBeGreaterThanOrEqual(10)
    },
  )

  it('drops the carry on the tick its walk harvests the core cell its centre crosses', () => {
    const [, , top] = coreTiles(3)
    const ticks = sweepWith(coreSweep(18), drillAlongStep, (effect) => effect)
    const harvest = ticks.find(({ events }) =>
      events.some((event) => event.type === 'TileDestroyed' && isAt(event, top)),
    )
    expect(harvest?.events.some(({ type }) => type === 'CoreTileHarvested')).toBe(true)
    expect(harvest && vehicleOf(harvest.state, 'p1').sweptCut?.carrySubSteps).toBe(0)
  })

  // Since ticket 570 the front opens the electrified cell as it bites through it, so the shock
  // lands as the cell yields; the walk ends where its centre enters the cell, paying the rest.
  it('drops the carry on the tick its walk enters the electrified cell on its path, shocked as it opens', () => {
    const fixture = fullHoldSweep(18)
    const ticks = withRegistrations(fixture.slices, () =>
      sweepWith(fixture, drillAlongStep, (effect) => effect),
    )
    const shocked = ticks.findIndex(({ events }) =>
      events.some((event) => event.type === 'TileDestroyed' && isAt(event, ELECTRIFIED)),
    )
    expect(ticks[shocked]?.events.some(({ type }) => type === 'ElectrifiedCellShocked')).toBe(true)
    const entered = ticks.findIndex(({ state }) => isCursorIn(state, ELECTRIFIED))
    expect(entered).toBeGreaterThanOrEqual(shocked)
    expect(vehicleOf(ticks[entered].state, 'p1').sweptCut?.carrySubSteps).toBe(0)
  })

  // Since ticket 570 a slow front opens an ore cell as it bites through it, so a full hold loses
  // its unit as the cell yields, mid-bite, and the walk pays the rest of it as any yielded cell:
  // the lost unit takes no place and ends no walk, and nothing is banked toward a later cell.
  it('loses each ore unit a full hold cannot take as its cell opens, the hold staying full', () => {
    const fixture = fullHoldSweep(18, [...PREFILLED, { tx: 56, ty: 292 }, { tx: 58, ty: 292 }])
    const ticks = withRegistrations(fixture.slices, () =>
      sweepWith(fixture, drillAlongStep, (effect) => effect),
    )
    const losing = ticks.filter(({ events }) => isLostInWalk(events))
    expect(losing.length).toBeGreaterThan(0)
    for (const { state } of losing) {
      const vehicle = vehicleOf(state, 'p1')
      expect(cargoUnitsOf(vehicle.cargo)).toBe(statsOfVehicle(vehicle).cargoCapacity)
    }
  })

  // The front cuts on that tick (ticket 570: a cell opens as the front passes its middle, which
  // may be a later tick, so the cut is its ground changing).
  it('drops the carry on the tick the tank empties, and cuts on that tick', () => {
    const rig = rigInColumn(QUICK_RIG, '10')
    const ticks = cutDown(rig, drillAlongStep, { strideMm: 40_000, ticks: 800 })
    const isDry = (state: AuthorityState) =>
      vehicleOf(state, 'p1').energy < ENERGY_QUANTA_PER_TICK.drill
    const emptied = ticks.findIndex(({ state }) => isDry(state))
    expect(emptied).toBeGreaterThan(-1)
    expect(ticks[emptied].events.some(({ type }) => type === 'GroundChanged')).toBe(true)
    expect(vehicleOf(ticks[emptied].state, 'p1').sweptCut?.carrySubSteps).toBe(0)
  })
})

/** The tick each cell's walk paid it in full: the cursor first stood in it or past it, below. */
function enteredTicksOf(ticks: readonly RuleEffect[], cells: readonly TilePoint[]): number[] {
  return cells.map((cell) =>
    ticks.findIndex(({ state }) => {
      const cursor = vehicleOf(state, 'p1').sweptCut
      return cursor !== undefined && cursor.yMm < (cell.ty + 1) * 1000
    }),
  )
}

function isCursorIn(state: AuthorityState, tile: TilePoint): boolean {
  const cursor = vehicleOf(state, 'p1').sweptCut
  return cursor !== undefined && isAt(tileOfMillimetres(cursor.xMm, cursor.yMm), tile)
}

function isAt(event: { tx: number; ty: number }, tile: TilePoint): boolean {
  return event.tx === tile.tx && event.ty === tile.ty
}

/** A unit lost right after a broken cell on column 57, every broken cell before it on the column. */
function isLostInWalk(events: readonly { type: string }[]): boolean {
  const broken = events.flatMap((event, at) => (isDestroyed(event) ? [at] : []))
  const walked = broken.filter((at, index) =>
    broken.slice(0, index + 1).every((before) => isOnColumn57(events[before])),
  )
  return walked.some((at) => events[at + 1]?.type === 'StorageFull')
}

function isOnColumn57(event: { type: string }): boolean {
  return 'tx' in event && event.tx === 57
}

function isDestroyed(event: { type: string }): boolean {
  return event.type === 'TileDestroyed'
}
