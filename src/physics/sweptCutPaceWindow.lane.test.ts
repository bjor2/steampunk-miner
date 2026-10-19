import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DRILL_SUBSTEPS_PER_TICK } from '../constants/balance'
import { DEV_FLAGS } from '../constants/devFlags'
import { PHYSICS_TIMESTEP, UP_VECTOR_SCALE } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import type { PlanetParams } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import type { WorldState } from '../systems/world/worldState'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import type { Vector2 } from '../systems/vehicle/localFrame'

// Fixed-window swept-cut pace (ticket 528, log-only; TD Q3 on #514, VS definition 6226431087):
// `sweptCutPace`'s rig and ground (planet 1, drill_power 50, tip 600, engine 5000, `drill.sweptCut`
// on, the tank refilled) over a 250 m window, a 60 s window and the leg's band-1 stretch (c = 23,
// where #514's lane read ~1.7% over 60/23), down and level. Metres are the body's progress along
// its facing. Each window logs the cells yielded, the pace against 60/c, and the law work per cell
// and per metre as the VS
// defined it: Σ(density removed × hardness), read from the ground before and after the window,
// never from the ledger.
//
// The excess over 60/c is split into measured factors that multiply back to it, each a pace ratio
// over the cells the cut's centre crossed (its path, `sweptCarry.ts`'s walk):
// - carry at the cell boundary: the walk prices a cell in sub-steps and carries the remainder into
//   the next cell (1362 sub-steps, 22.70 ticks, on band 1), where c = 23 rounds it up per cell;
// - path cells per metre: a curved or slanting leg crosses more than one cell a metre, and a fall
//   through a cave crosses metres the cursor does not walk;
// - open ground: path cells already open when the cut came next to them (caves) cost nothing;
// - rim pre-dig: the stamp's rim cuts a path cell before the walk pays it, and the walk prices
//   only the share left on the tick it pays (`sweptCarry.ts`: "a part-dug cell pays only for what
//   is left"), read as the cell's density at the end of the tick before it yields;
// - the rest: ticks the walk paid no path cell (gate shut, waits) and carry it dropped; never
//   above 0, since the walk spends at most a tick's sub-steps a tick.
// Partial yield (density a yielded cell keeps) is logged beside them for path and drilled cells.
//
// Planet 1's band 1 is only the top 8% of a 300-tile radius (24 m), so no 250 m leg down stays at
// 23 ticks a cell: the down leg crosses bands 1 to 4 and every law is read per path cell; the level
// leg starts in band 1 and follows the curve. The hold is made large so ore never stops the walk
// (the purse counts free places) and the hull is kept full (a long leg meets falls and ground a
// wreck would end); neither touches the drill or the engine. A lane: it runs only when named and
// writes balance-report/swept-cut-pace-window.ndjson.

const RIG_LEVELS = {
  drill_tip: 600,
  engine: 17,
  drill_power: 4,
  cargo_hold: 63,
  hull: 0,
} as const
const WINDOW_METRES = 250
const WINDOW_SECONDS = 60
/** As `sweptCutPace`: the cut ramps up before the window opens. */
const RAMP_SECONDS = 3
/** Into band 1 before the level leg turns (about 8 m). */
const LEVEL_DEPTH_SECONDS = 3
/** A leg that has not closed both windows by then has stalled; the spec says so. */
const LEG_LIMIT_SECONDS = 300
const TICKS_PER_SECOND = Math.round(1 / PHYSICS_TIMESTEP)
/** 16 samples of 255. */
const FULL_CELL_DENSITY = 4080
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 900_000
const WINDOW_NAMES: readonly WindowName[] = ['metres', 'seconds', 'bandOne']
const WINDOW_LABELS: Readonly<Record<WindowName, string>> = {
  metres: '250 m',
  seconds: '60 s',
  bandOne: 'band 1',
}

type Leg = 'down' | 'level'
/** 250 m, 60 s, and the leg's band-1 stretch (c = 23, the ~1.7% of #514's lane). */
type WindowName = 'metres' | 'seconds' | 'bandOne'
type Modules = Awaited<ReturnType<typeof importFreshModules>>

/**
 * A cell watched from when the cut's centre came next to it (the 3x3 round the cursor's tile):
 * its density each time it changed, and the tick it yielded with the density it kept.
 */
interface WatchedCell {
  tile: TilePoint
  generatedSum: number
  sums: DensityChange[]
  yieldTick: number | null
  sumAtYield: number
}

/** The cell's density sum from the end of `tick` on. */
interface DensityChange {
  tick: number
  sum: number
}

/** The ground and the leg at one edge of a window. */
interface WindowEdge {
  tick: number
  travelledM: number
  world: WorldState
}

/** A path cell: the first tick the cursor stood in it. */
interface PathEntry {
  tile: TilePoint
  tick: number
}

interface LegTrace {
  params: PlanetParams
  path: PathEntry[]
  pathKeys: Set<string>
  watched: Map<string, WatchedCell>
  start: WindowEdge
  previous: WindowEdge
  edges: Record<WindowName, WindowEdge | null>
}

/** The cut's law times for one cell, in whole ticks (c) and in sub-steps, and its band. */
interface LawTimes {
  ticks: number
  subSteps: number
  band: number
}

/**
 * A path cell, and the tick before the walk began paying it: the walk stops the stamp before a
 * paid cell's edge (`sweepDwell.ts`), so it pays a cell while the cursor stands in the one before.
 */
interface PathCell {
  cell: WatchedCell
  payFromTick: number
}

/** A path cell the cut had to pay for, with its law times and its density when paying began. */
interface SolidPathCell {
  cell: WatchedCell
  law: LawTimes
  sumWhenPaid: number
}

/** Σ(density removed × hardness) over every cell the window changed, read from the ground. */
interface GroundWork {
  lawWork: number
  /** The same removal in each cell's whole-tick law time. */
  lawTicks: number
  /** Yielded inside the window with density removed: the drill's. */
  cellsYielded: number
  densityLeftInYielded: number
  /** Yielded inside the window with no density removed (not the drill's cut). */
  cellsYieldedUncut: number
}

/** Ticks a metre at each law, and the factors between them. */
interface PathTimes {
  pathCells: number
  solidPathCells: number
  /** c over the solid path cells, the 60/c reference (23 on band 1). */
  wholeTicksPerCell: number
  subStepTicksPerCell: number
  pathCellsPerMetre: number
  solidShare: number
  uncutShare: number
  bandOneShare: number
  pathDensityLeftAtYield: number
}

interface WindowReading extends PathTimes {
  leg: Leg
  window: WindowName
  metres: number
  seconds: number
  metresPerSecond: number
  /** 60/c in metres a second at one cell a metre. */
  lawPace: number
  ticksPerMetre: number
  cellsYielded: number
  cellsYieldedUncut: number
  lawWork: number
  lawWorkPerCell: number
  lawWorkPerMetre: number
  lawTicksPerCell: number
  lawTicksPerMetre: number
  yieldedDensityLeftAtEnd: number
  excessOverLaw: number
  carryAtCellBoundary: number
  pathGeometry: number
  openGround: number
  rimPreDig: number
  rest: number
}

async function importFreshModules() {
  vi.resetModules()
  ;(await import('../registries/registrar')).loadSlices([])
  return {
    runLog: await import('../logging/runLog'),
    store: await import('../store/gameStore'),
    loop: await import('../scene/vehicleLoop'),
    controller: await import('./vehicleController'),
    input: await import('../systems/input/buildIntent'),
    stats: await import('../systems/economy/vehicleStats'),
    link: await import('../store/authorityLink'),
    planet: await import('../systems/authority/planetOfState'),
    drill: await import('../systems/authority/groundDrill'),
    world: await import('../systems/world/worldState'),
    cells: await import('../systems/world/cellYield'),
    geometry: await import('../systems/world/planetGeometry'),
    grid: await import('../systems/world/tileGrid'),
    pose: await import('../systems/vehicle/vehiclePose'),
    money: await import('../systems/money'),
  }
}

/** Off the pad, then the leg held until both windows have closed; read on a fresh module graph. */
async function readLeg(leg: Leg): Promise<WindowReading[]> {
  const m = await importFreshModules()
  m.store.resetGameStore()
  const log = { runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }
  m.runLog.installRunLog(m.runLog.createRunLog(log))
  try {
    const trace = playLeg(m, leg)
    return WINDOW_NAMES.map((window) => readWindow(m, leg, trace, window))
  } finally {
    m.runLog.uninstallRunLog()
  }
}

function playLeg(m: Modules, leg: Leg): LegTrace {
  const params = setUpRig(m)
  const rig = createRig(m)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  rig.hold(m.input.buildIntent(['aim_left']), 2)
  if (leg === 'level') rig.hold(m.input.buildIntent(['aim_down']), LEVEL_DEPTH_SECONDS)
  const intent = m.input.buildIntent(leg === 'down' ? ['aim_down'] : ['aim_left'])
  rig.hold(intent, RAMP_SECONDS)
  return traceWindows(m, rig, params, intent)
}

function setUpRig(m: Modules): PlanetParams {
  const game = m.store.useGameStore.getState()
  for (const [track, level] of Object.entries(RIG_LEVELS)) game.setUpgrade(track, level)
  const params = m.planet.planetParamsOf(m.link.readAuthorityState().planet)
  if (params === null) throw new Error('planet 1 has no world')
  return params
}

/** The body and the live loop, one fixed tick at a time, the tank and the hull kept full. */
function createRig(m: Modules) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = m.store.readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const body = m.controller.createVehicleBody(RAPIER, world, start)
  const controller = m.controller.createVehicleController(RAPIER, world, body)
  const loop = m.loop.createVehicleLoop({ ...DEV_FLAGS, 'drill.sweptCut': true })
  const fullHull = m.money.toCanonical(m.stats.hullMaxAtStep(RIG_LEVELS.hull))
  const path = { steps: 0, travelledM: 0, at: controller.planetPosition() }
  const stepOnce = (intent: VehicleIntent) => {
    if (path.steps++ % TICKS_PER_SECOND === 0) refillTankAndHull(m, fullHull)
    loop.step(controller, intent)
    controller.stepWorld()
    path.travelledM += progressAlongFacing(m, path.at, controller.planetPosition())
    path.at = controller.planetPosition()
  }
  const hold = (intent: VehicleIntent, seconds: number) => {
    for (let tick = 0; tick < Math.round(seconds * TICKS_PER_SECOND); tick++) stepOnce(intent)
  }
  return { stepOnce, hold, travelledM: () => path.travelledM }
}

type Rig = ReturnType<typeof createRig>

function refillTankAndHull(m: Modules, fullHull: string): void {
  const game = m.store.useGameStore.getState()
  game.setEnergy('150')
  game.setHull(fullHull)
}

/**
 * The tick's move along the body's facing, signed: the level leg follows the planet's curve, so
 * its metres are not one axis, and the body's wobble across or back cancels instead of adding up.
 */
function progressAlongFacing(m: Modules, from: Vector2, to: Vector2): number {
  const pose = m.store.readLocalVehicle().pose
  if (pose === null) return 0
  const facing = m.pose.facingVectorOf(pose.upx, pose.upy, pose.facing)
  const along = (to.x - from.x) * facing.x + (to.y - from.y) * facing.y
  return along / UP_VECTOR_SCALE
}

function traceWindows(m: Modules, rig: Rig, params: PlanetParams, intent: VehicleIntent): LegTrace {
  const edgeNow = (): WindowEdge => ({
    tick: m.store.readAuthorityTick(),
    travelledM: rig.travelledM(),
    world: m.link.readAuthorityState().world,
  })
  const start = edgeNow()
  const trace: LegTrace = {
    params,
    path: [],
    pathKeys: new Set(),
    watched: new Map(),
    start,
    previous: start,
    edges: { metres: null, seconds: null, bandOne: null },
  }
  const limit = LEG_LIMIT_SECONDS * TICKS_PER_SECOND
  for (let tick = 0; tick < limit && !areWindowsClosed(trace); tick++) {
    rig.stepOnce(intent)
    noteTick(m, trace, edgeNow())
  }
  trace.edges.bandOne ??= trace.previous
  return trace
}

function areWindowsClosed({ edges }: LegTrace): boolean {
  return edges.metres !== null && edges.seconds !== null
}

function noteTick(m: Modules, trace: LegTrace, edge: WindowEdge): void {
  const cursorTile = cursorTileOf(m)
  if (cursorTile !== null) notePathCell(trace, cursorTile, edge.tick)
  if (cursorTile !== null) watchAround(m, trace, edge, cursorTile)
  if (cursorTile !== null) closeBandOneWindow(m, trace, cursorTile)
  closeDueWindows(trace, edge)
  trace.previous = edge
}

function cursorTileOf(m: Modules): TilePoint | null {
  const cursor = m.store.readLocalVehicle().sweptCut
  return cursor === undefined ? null : m.pose.tileOfMillimetres(cursor.xMm, cursor.yMm)
}

function notePathCell(trace: LegTrace, tile: TilePoint, tick: number): void {
  const key = tileKeyOf(tile)
  if (trace.pathKeys.has(key)) return
  trace.pathKeys.add(key)
  trace.path.push({ tile, tick })
}

function closeDueWindows(trace: LegTrace, edge: WindowEdge): void {
  if (trace.edges.metres === null && edge.travelledM - trace.start.travelledM >= WINDOW_METRES) {
    trace.edges.metres = edge
  }
  if (trace.edges.seconds === null && edge.tick - trace.start.tick >= secondsInTicks()) {
    trace.edges.seconds = edge
  }
}

/** Closed on the tick before the cut's centre first stands past band 1. */
function closeBandOneWindow(m: Modules, trace: LegTrace, cursorTile: TilePoint): void {
  if (trace.edges.bandOne !== null) return
  const band = m.geometry.bandOfTile(trace.params, cursorTile.tx, cursorTile.ty)
  if (band !== 1) trace.edges.bandOne = trace.previous
}

function secondsInTicks(): number {
  return WINDOW_SECONDS * TICKS_PER_SECOND
}

/** The 3x3 cells round the cursor's tile: a path cell is among them before the cut reaches it. */
function watchAround(m: Modules, trace: LegTrace, edge: WindowEdge, centre: TilePoint): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      watchCell(m, trace, edge, { tx: centre.tx + dx, ty: centre.ty + dy })
    }
  }
}

function watchCell(m: Modules, trace: LegTrace, edge: WindowEdge, tile: TilePoint): void {
  const key = tileKeyOf(tile)
  const cell = trace.watched.get(key) ?? approachedCellOf(m, trace, tile)
  trace.watched.set(key, cell)
  const sum = m.cells.cellDensitySum(edge.world, trace.params, tile)
  if (sum !== cell.sums[cell.sums.length - 1].sum) cell.sums.push({ tick: edge.tick, sum })
  if (cell.yieldTick !== null || !m.world.isTileYielded(edge.world, tile)) return
  cell.yieldTick = edge.tick
  cell.sumAtYield = sum
}

/** Its density before this tick's cut: the cut's centre has just come next to it. */
function approachedCellOf(m: Modules, trace: LegTrace, tile: TilePoint): WatchedCell {
  const before = trace.previous
  const sum = m.cells.cellDensitySum(before.world, trace.params, tile)
  const generatedSum = m.cells.cellDensitySum(m.world.EMPTY_WORLD, trace.params, tile)
  const yieldTick = m.world.isTileYielded(before.world, tile) ? before.tick : null
  const sums = [{ tick: before.tick, sum }]
  return { tile, generatedSum, sums, yieldTick, sumAtYield: sum }
}

/** The density at the end of `tick`; before the cell was watched, the first one seen. */
function sumAtTick({ sums }: WatchedCell, tick: number): number {
  const known = sums.filter((change) => change.tick <= tick)
  return (known[known.length - 1] ?? sums[0]).sum
}

/** Yielded, or at most half its generated density (generated air included): costs the walk nothing. */
function isOpenAt(cell: WatchedCell, tick: number): boolean {
  const isYielded = cell.yieldTick !== null && cell.yieldTick <= tick
  return isYielded || sumAtTick(cell, tick) * 2 <= cell.generatedSum
}

function tileKeyOf({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

/** Each cell's law times at the rig's drill stats; planet 1 has no electrified cells. */
function createLawTimes(m: Modules, params: PlanetParams) {
  const drill = m.stats.vehicleStatsAt({ ...m.stats.startLevels(), ...RIG_LEVELS })
  const noShock = () => 0
  const ticksOf = m.drill.drillTicksOfCells(params, drill, noShock)
  const subStepsOf = m.drill.drillSubStepsOfCells(params, drill, noShock)
  return (world: WorldState, tile: TilePoint): LawTimes | null => {
    const material = m.world.materialCellAt(world, params, tile)
    const ticks = ticksOf(tile, material, 0)
    const subSteps = subStepsOf(tile, material, 0)
    const band = m.geometry.bandOfTile(params, tile.tx, tile.ty)
    return ticks === null || subSteps === null ? null : { ticks, subSteps, band }
  }
}

type LawTimesOf = ReturnType<typeof createLawTimes>

function readWindow(m: Modules, leg: Leg, trace: LegTrace, window: WindowName): WindowReading {
  const end = trace.edges[window]
  if (end === null) throw new Error(`the ${leg} leg stalled before its ${window} window closed`)
  const lawOf = createLawTimes(m, trace.params)
  const metres = end.travelledM - trace.start.travelledM
  const ground = groundWorkBetween(m, trace.params, { start: trace.start, end, lawOf })
  const times = pathTimesOf(trace, end, lawOf, metres)
  return windowReadingOf({ leg, window, metres, ticks: end.tick - trace.start.tick, ground, times })
}

/** The path cells the cursor entered inside the window, as the walk met them. */
function pathTimesOf(
  trace: LegTrace,
  end: WindowEdge,
  lawOf: LawTimesOf,
  metres: number,
): PathTimes {
  const cells = pathCellsBefore(trace, end.tick)
  const solid = solidPathCellsOf(cells, end.world, lawOf)
  const yielded = solid.filter(({ cell }) => cell.yieldTick !== null)
  const subSteps = sumOf(solid.map(({ law }) => law.subSteps))
  return {
    pathCells: cells.length,
    solidPathCells: solid.length,
    wholeTicksPerCell: meanOf(solid.map(({ law }) => law.ticks)),
    subStepTicksPerCell: subSteps / solid.length / DRILL_SUBSTEPS_PER_TICK,
    pathCellsPerMetre: cells.length / metres,
    solidShare: solid.length / cells.length,
    uncutShare: sumOf(solid.map(uncutSubStepsOf)) / subSteps,
    bandOneShare: solid.filter(({ law }) => law.band === 1).length / solid.length,
    pathDensityLeftAtYield: meanOf(yielded.map(({ cell }) => cell.sumAtYield / cell.generatedSum)),
  }
}

/** Every path cell after the window's first, entered by the window's end. */
function pathCellsBefore(trace: LegTrace, endTick: number): PathCell[] {
  return trace.path.slice(1).flatMap(({ tile, tick }, index) => {
    const cell = trace.watched.get(tileKeyOf(tile))
    if (cell === undefined || tick > endTick) return []
    return [{ cell, payFromTick: trace.path[index].tick - 1 }]
  })
}

function solidPathCellsOf(
  cells: readonly PathCell[],
  world: WorldState,
  lawOf: LawTimesOf,
): SolidPathCell[] {
  return cells.flatMap(({ cell, payFromTick }) => {
    const law = isOpenAt(cell, payFromTick) ? null : lawOf(world, cell.tile)
    const paidTick = cell.yieldTick === null ? payFromTick : cell.yieldTick - 1
    return law === null ? [] : [{ cell, law, sumWhenPaid: sumAtTick(cell, paidTick) }]
  })
}

/** What the walk pays for a path cell: its sub-steps times the share the rim left standing. */
function uncutSubStepsOf({ cell, law, sumWhenPaid }: SolidPathCell): number {
  return (law.subSteps * sumWhenPaid) / cell.generatedSum
}

interface WindowParts {
  leg: Leg
  window: WindowName
  metres: number
  ticks: number
  ground: GroundWork
  times: PathTimes
}

function windowReadingOf({
  leg,
  window,
  metres,
  ticks,
  ground,
  times,
}: WindowParts): WindowReading {
  const ticksPerMetre = ticks / metres
  return {
    leg,
    window,
    metres,
    seconds: ticks / TICKS_PER_SECOND,
    metresPerSecond: (metres * TICKS_PER_SECOND) / ticks,
    lawPace: TICKS_PER_SECOND / times.wholeTicksPerCell,
    ticksPerMetre,
    cellsYielded: ground.cellsYielded,
    cellsYieldedUncut: ground.cellsYieldedUncut,
    lawWork: ground.lawWork,
    lawWorkPerCell: ground.lawWork / ground.cellsYielded,
    lawWorkPerMetre: ground.lawWork / metres,
    lawTicksPerCell: ground.lawTicks / ground.cellsYielded,
    lawTicksPerMetre: ground.lawTicks / metres,
    yieldedDensityLeftAtEnd: ground.densityLeftInYielded / ground.cellsYielded,
    ...times,
    ...excessFactorsOf(times, ticksPerMetre),
  }
}

/**
 * The excess over 60/c and the factors that multiply back to it, each a pace ratio: the walk's
 * ticks a metre are the sub-step law times path cells a metre, solid share and uncut share.
 */
function excessFactorsOf(times: PathTimes, ticksPerMetre: number) {
  const walkTicksPerMetre =
    times.subStepTicksPerCell * times.pathCellsPerMetre * times.solidShare * times.uncutShare
  return {
    excessOverLaw: times.wholeTicksPerCell / ticksPerMetre - 1,
    carryAtCellBoundary: times.wholeTicksPerCell / times.subStepTicksPerCell - 1,
    pathGeometry: 1 / times.pathCellsPerMetre - 1,
    openGround: 1 / times.solidShare - 1,
    rimPreDig: 1 / times.uncutShare - 1,
    rest: walkTicksPerMetre / ticksPerMetre - 1,
  }
}

interface GroundSpan {
  start: WindowEdge
  end: WindowEdge
  lawOf: LawTimesOf
}

function groundWorkBetween(m: Modules, params: PlanetParams, span: GroundSpan): GroundWork {
  const work: GroundWork = {
    lawWork: 0,
    lawTicks: 0,
    cellsYielded: 0,
    densityLeftInYielded: 0,
    cellsYieldedUncut: 0,
  }
  for (const key of Object.keys(span.end.world.chunks)) {
    const [cx, cy] = key.split(',').map((part) => Number.parseInt(part, 10))
    for (const tile of tilesOfChunk(m, cx, cy)) addCellWork(m, params, tile, { ...span, work })
  }
  return work
}

function tilesOfChunk(m: Modules, cx: number, cy: number): TilePoint[] {
  const tiles: TilePoint[] = []
  for (let y = 0; y < m.grid.CHUNK_SIZE; y++) {
    for (let x = 0; x < m.grid.CHUNK_SIZE; x++) {
      tiles.push({ tx: m.grid.firstTileOfChunk(cx) + x, ty: m.grid.firstTileOfChunk(cy) + y })
    }
  }
  return tiles
}

function addCellWork(
  m: Modules,
  params: PlanetParams,
  tile: TilePoint,
  { start, end, lawOf, work }: GroundSpan & { work: GroundWork },
): void {
  const before = m.cells.cellDensitySum(start.world, params, tile)
  const after = m.cells.cellDensitySum(end.world, params, tile)
  const isNewlyYielded =
    m.world.isTileYielded(end.world, tile) && !m.world.isTileYielded(start.world, tile)
  if (isNewlyYielded && after >= before) work.cellsYieldedUncut += 1
  if (after >= before) return
  const removedShare = (before - after) / FULL_CELL_DENSITY
  const material = m.world.materialCellAt(end.world, params, tile)
  const hardness = m.money.toCanonical(m.drill.hardnessOfTile(params, tile, material))
  work.lawWork += removedShare * Number.parseFloat(hardness)
  work.lawTicks += removedShare * (lawOf(end.world, tile)?.ticks ?? 0)
  if (!isNewlyYielded) return
  work.cellsYielded += 1
  work.densityLeftInYielded += after / FULL_CELL_DENSITY
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

function meanOf(values: readonly number[]): number {
  return values.length === 0 ? 0 : sumOf(values) / values.length
}

const TABLE_COLUMNS: readonly [string, (r: WindowReading) => string | number][] = [
  ['leg', (r) => r.leg],
  ['window', (r) => WINDOW_LABELS[r.window]],
  ['m', (r) => r.metres.toFixed(1)],
  ['s', (r) => r.seconds.toFixed(1)],
  ['m/s', (r) => r.metresPerSecond.toFixed(3)],
  ['60/c', (r) => r.lawPace.toFixed(3)],
  ['c', (r) => r.wholeTicksPerCell.toFixed(2)],
  ['sub-step c', (r) => r.subStepTicksPerCell.toFixed(2)],
  ['band 1', (r) => percentOf(r.bandOneShare)],
  ['excess', (r) => percentOf(r.excessOverLaw)],
  ['carry', (r) => percentOf(r.carryAtCellBoundary)],
  ['path geometry', (r) => percentOf(r.pathGeometry)],
  ['open ground', (r) => percentOf(r.openGround)],
  ['rim pre-dig', (r) => percentOf(r.rimPreDig)],
  ['rest', (r) => percentOf(r.rest)],
  ['path left at yield', (r) => r.pathDensityLeftAtYield.toFixed(4)],
  ['cells yielded', (r) => r.cellsYielded],
  ['yielded left', (r) => r.yieldedDensityLeftAtEnd.toFixed(4)],
  ['uncut yields', (r) => r.cellsYieldedUncut],
  ['law work/cell', (r) => r.lawWorkPerCell.toFixed(4)],
  ['law work/m', (r) => r.lawWorkPerMetre.toFixed(4)],
  ['law ticks/cell', (r) => r.lawTicksPerCell.toFixed(2)],
  ['law ticks/m', (r) => r.lawTicksPerMetre.toFixed(2)],
]

function formatReadings(readings: readonly WindowReading[]): string {
  const header = TABLE_COLUMNS.map(([name]) => name).join(' | ')
  const rows = readings.map((r) => TABLE_COLUMNS.map(([, cellOf]) => cellOf(r)).join(' | '))
  return [header, ...rows].join('\n')
}

function percentOf(share: number): string {
  return `${(share * 100).toFixed(2)}%`
}

function writeReadings(readings: readonly WindowReading[]): void {
  const lines = readings.map((reading) =>
    JSON.stringify({ report: 'swept-cut-pace-window', ticket: 528, ...reading }),
  )
  mkdirSync(REPORT_FOLDER, { recursive: true })
  writeFileSync(new URL('swept-cut-pace-window.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

function isWindowShort(reading: WindowReading): boolean {
  if (reading.window === 'metres') return reading.metres < WINDOW_METRES
  if (reading.window === 'seconds') return reading.seconds < WINDOW_SECONDS
  return false
}

/** The factors multiply back to the excess, so no cause is counted twice or left out. */
function factorProductOf(r: WindowReading): number {
  const factors = [r.carryAtCellBoundary, r.pathGeometry, r.openGround, r.rimPreDig, r.rest]
  return factors.reduce((product, factor) => product * (1 + factor), 1) - 1
}

beforeAll(async () => {
  await RAPIER.init()
})

describe('swept cut pace over fixed windows (ticket 528)', () => {
  let readings: WindowReading[] = []

  beforeAll(async () => {
    readings = [...(await readLeg('down')), ...(await readLeg('level'))]
    console.log(formatReadings(readings))
    writeReadings(readings)
  }, RUN_TIMEOUT_MS)

  it('closes the 250 m and the 60 s window on both legs, with the band-1 stretch beside them', () => {
    expect(readings.filter(isWindowShort).map(({ leg, window }) => `${leg} ${window}`)).toEqual([])
  })

  it('reads law work from the ground and solid path cells in every window', () => {
    const empty = readings.filter(
      ({ lawWork, solidPathCells }) => lawWork <= 0 || solidPathCells < 2,
    )
    expect(empty.map(({ leg, window }) => `${leg} ${window}`)).toEqual([])
  })

  it('splits the excess over 60/c into factors that multiply back to it', () => {
    for (const reading of readings) {
      expect(factorProductOf(reading)).toBeCloseTo(reading.excessOverLaw, 9)
    }
  })
})
