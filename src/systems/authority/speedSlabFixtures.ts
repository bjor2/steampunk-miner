/**
 * The speed-scaling slab of ticket 560 (the TD's test row on #551, ticket C): planet 1's column
 * `COLUMN` cut straight down from open ground by `drillStep` a tick, as the live client sends it,
 * with a report every 12 ticks, so the authority's own step bound clamps every stride. The column
 * is scripted: every cell the bore reaches is plain rock (`swapTileCells`, material only, so the
 * generated densities and caves stay) but for, top down, a first ore cell, a gated ore cell and an
 * artefact cache tile right under it, the ore cells copied from planet 1's own surface ore. A probe
 * gate refuses the gated cell until `GATE_OPENS_AT_TICK`; the rig then cuts on to the column's foot
 * and rests there, lined at grade 5 so no cave-in refills the bore.
 *
 * The body keeps pace with the cut as the live body does (`sweptRigFixtures.ts`): each tick it moves
 * one stride down, never past where the cut let it, so it stands at the gate while the gate holds.
 * The rig is the weakest drill whose law step reaches the stride (tip 400, which scratches every
 * planet-1 rock), so the stride is what its stats allow. Every command's charge and the law work it
 * removed are tallied, as the law slab does (`lawCarrySlabFixtures.ts`). Only specs use this.
 */
import { DRILL_STAMP_AHEAD_MM, STEP_BOUND_TOLERANCE_MM } from '../../constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../constants/physics'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { FACING } from '../vehicle/vehiclePose'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { swapTileCells } from '../world/terrainCellEdits'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import { ARTEFACT_CACHE_CELL, GROUND_CELL } from '../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../world/worldState'
import type { CommandIntent } from './authorityCommand'
import { createAuthorityState, vehicleOf, type AuthorityState } from './authorityState'
import { setCasingGradeCommand } from './casingDebugCommands'
import { lawWorkOfGroundChanges } from './cutCarryFixtures'
import type { DomainEvent } from './domainEvent'
import {
  continueScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  WORLD_SEED,
  type ScriptedSession,
} from './scriptedSession'
import { stepBoundsAt } from './stepBoundRead'

/** A band-1 column east of the pad whose bore is solid rock from the surface to its foot. */
export const COLUMN = 24
const SURFACE_TY = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
/** The scripted cells, rows under the surface row. */
export const SLAB_TILES = {
  firstOre: { tx: COLUMN, ty: SURFACE_TY - 5 },
  gated: { tx: COLUMN, ty: SURFACE_TY - 12 },
  cache: { tx: COLUMN, ty: SURFACE_TY - 13 },
  foot: { tx: COLUMN, ty: SURFACE_TY - 24 },
} as const
/** Rock round the bore, cells either side of the column and rows under the foot (the cut's lead). */
const ROCK_HALF_WIDTH = 3
const ROCK_UNDER_FOOT = 70
const START = { x: COLUMN * 1000 + 500, y: (SURFACE_TY + 3) * 1000 + 500 }
/** The body rests with its report stamp on the foot cell's floor. */
const END_Y = SLAB_TILES.foot.ty * 1000 + DRILL_STAMP_AHEAD_MM
export const GATE_OPENS_AT_TICK = 300
/** Ten seconds of ticks: the run's whole length, rest included. */
export const RUN_TICKS = 600
const REPORT_EVERY = 12
const REFILL_EVERY = 60
const RIG_TIP = 400
const MAX_DRILL_POWER = 400
export const CUTTING_PLAYER = 'p2'
/** Lined at grade 5 behind the drill, as the law slab is, so no cave-in refills the bore. */
const CASING_GRADE = 5

/** The probe gate: refuses the gated cell before `GATE_OPENS_AT_TICK`, asks nothing after. */
export const SLAB_GATE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.slab',
      check: ({ state, tile }) => (isGateShut(state, tile) ? REFUSED : null),
    }),
}

const REFUSED = {
  outcome: 'refused',
  gateKind: 'probe',
  required: 'probe-rig',
  have: 'none',
} as const

function isGateShut(state: AuthorityState, tile: TilePoint): boolean {
  const isGatedTile = tile.tx === SLAB_TILES.gated.tx && tile.ty === SLAB_TILES.gated.ty
  return isGatedTile && state.tick < GATE_OPENS_AT_TICK
}

export function strideOfSpeed(speedMps: number): number {
  return Math.round((speedMps * MM_PER_METRE) / TICKS_PER_SECOND)
}

/** What a slab run read, tick by tick and in sum. */
export interface SlabRun {
  start: AuthorityState
  end: AuthorityState
  /** The state the last tick before the gate opens left. */
  heldAtGate: AuthorityState
  /** Every event of the run's cut and reports, in order, stamped. */
  events: DomainEvent[]
  /** The tank's fall over the cut, less the reports' drive charge. */
  energy: number
  /** The law work every command removed, read from the ground (`lawWorkOfGroundChanges`). */
  lawWork: number
  /** The first tick the body stood at the column's foot; null if it never got there. */
  arrivedTick: number | null
  /** The deepest the cut's stamp centre reached, mm (a report restarts the cursor at its own stamp). */
  cutFootYMm: number
  /** Each tick's step time, ms, by the watch's clock: read only by the timing lane. */
  stepMs: number[]
  watch: SlabWatch
}

export interface SlabRig {
  levels: Record<string, number>
  strideMm: number
}

/** The weakest drill whose law step on band-1 rock reaches `strideMm`, with the slab's tip. */
export function slabRigOf(strideMm: number): SlabRig {
  const reaches = (power: number) => lawStepOf(power) >= strideMm
  if (!reaches(MAX_DRILL_POWER)) throw new Error(`no drill reaches ${strideMm} mm a tick`)
  let [low, high] = [1, MAX_DRILL_POWER]
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (reaches(middle)) high = middle
    else low = middle + 1
  }
  return { levels: rigLevelsOf(low), strideMm }
}

function rigLevelsOf(drillPower: number): Record<string, number> {
  return { drill_power: drillPower, drill_tip: RIG_TIP }
}

/** The law's cut step a tick: the cutting bound less its one-sample tolerance. */
function lawStepOf(drillPower: number): number {
  const session = armedSession(rigLevelsOf(drillPower))
  return stepBoundsAt(session.state(), CUTTING_PLAYER).cuttingMm - STEP_BOUND_TOLERANCE_MM
}

/** Two players on planet 1 over the scripted column; `p2` armed with the rig and reported at the top. */
function armedSession(levels: Record<string, number>): ScriptedSession {
  const session = continueScriptedSession(scriptedColumnState())
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setCasingGradeCommand(CASING_GRADE), CUTTING_PLAYER)
  for (const [upgradeId, level] of Object.entries(levels)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } }, CUTTING_PLAYER)
  }
  session.submit(0, refillOf(session), CUTTING_PLAYER)
  session.submit(0, reportAt(START.y, 0), CUTTING_PLAYER)
  return session
}

let columnState: AuthorityState | null = null

/** Built on first use, never at import: the ore cells read the generation hooks' registry. */
function scriptedColumnState(): AuthorityState {
  columnState ??= columnStateOf()
  return columnState
}

function columnStateOf(): AuthorityState {
  const playerIds = ['p1', CUTTING_PLAYER]
  const state = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds })
  return { ...state, world: swapTileCells(state.world, columnSwaps()).world }
}

/** Rock round the bore, then the three scripted cells: two real ore cells and a cache. */
function columnSwaps() {
  const [firstOre, otherOre] = surfaceOreCells()
  const placed = [
    { ...SLAB_TILES.firstOre, cell: firstOre },
    { ...SLAB_TILES.gated, cell: otherOre },
    { ...SLAB_TILES.cache, cell: ARTEFACT_CACHE_CELL },
  ]
  return [...rockRoundTheBore(), ...placed]
}

/** Two generated surface ore cells of planet 1, kind slots and all (the roster's, ticket 446). */
function surfaceOreCells(): number[] {
  return surfaceOreTiles(2).map((tile) => cellAt(EMPTY_WORLD, PARAMS, tile))
}

function rockRoundTheBore() {
  const swaps: { tx: number; ty: number; cell: number }[] = []
  for (let ty = SLAB_TILES.foot.ty - ROCK_UNDER_FOOT; ty <= SURFACE_TY; ty++) {
    for (let tx = COLUMN - ROCK_HALF_WIDTH; tx <= COLUMN + ROCK_HALF_WIDTH; tx++) {
      swaps.push({ tx, ty, cell: GROUND_CELL })
    }
  }
  return swaps
}

/** What a run reads besides its sums: a clock in ms (the timing lane) and each tick's state. */
export interface SlabWatch {
  clock: () => number
  onTick: (state: AuthorityState, tick: number) => void
}

const NO_WATCH: SlabWatch = { clock: () => 0, onTick: () => undefined }

/** Cuts the slab with `rig`, tick by tick, `RUN_TICKS` long, and reads what it did. */
export function cutSpeedSlab(rig: SlabRig, watch: Partial<SlabWatch> = {}): SlabRun {
  const session = armedSession(rig.levels)
  const run = startRun(session.state(), { ...NO_WATCH, ...watch })
  let bodyY = START.y
  for (let tick = 1; tick <= RUN_TICKS; tick++) {
    session.advanceTo(tick)
    if (tick % REFILL_EVERY === 0) session.submit(tick, refillOf(session), CUTTING_PLAYER)
    bodyY = bodyYAfter(session.state(), bodyY, rig.strideMm, tick === 1)
    stepAndReport(run, session, tick, bodyY)
    noteTick(run, session.state(), tick, bodyY)
  }
  return run
}

function startRun(start: AuthorityState, watch: SlabWatch): SlabRun {
  return {
    watch,
    start,
    end: start,
    heldAtGate: start,
    events: [],
    energy: 0,
    lawWork: 0,
    arrivedTick: null,
    cutFootYMm: START.y,
    stepMs: [],
  }
}

/** The body one stride down, held at the foot and behind where the cut reached (as the live body). */
function bodyYAfter(state: AuthorityState, bodyY: number, strideMm: number, isFirst: boolean) {
  if (isFirst) return bodyY
  const cursor = vehicleOf(state, CUTTING_PLAYER).sweptCut
  const cutLets = cursor === undefined ? bodyY : cursor.yMm + DRILL_STAMP_AHEAD_MM
  return Math.min(bodyY, Math.max(bodyY - strideMm, END_Y, cutLets))
}

function stepAndReport(run: SlabRun, session: ScriptedSession, tick: number, bodyY: number): void {
  run.stepMs.push(submitTallied(run, session, tick, stepAt(bodyY)))
  if (tick % REPORT_EVERY === 0) submitTallied(run, session, tick, reportAt(bodyY, REPORT_EVERY))
}

function noteTick(run: SlabRun, state: AuthorityState, tick: number, bodyY: number): void {
  run.watch.onTick(state, tick)
  run.end = state
  run.cutFootYMm = Math.min(
    run.cutFootYMm,
    vehicleOf(state, CUTTING_PLAYER).sweptCut?.yMm ?? START.y,
  )
  if (tick === GATE_OPENS_AT_TICK - 1) run.heldAtGate = state
  if (run.arrivedTick === null && bodyY === END_Y) run.arrivedTick = tick
}

/**
 * Submits one command and tallies its events, its drill charge and the law work it removed;
 * answers the ms the command alone took by the watch's clock, the tally's reads left out.
 */
function submitTallied(
  run: SlabRun,
  session: ScriptedSession,
  tick: number,
  command: CommandIntent,
): number {
  const was = session.state()
  const before = session.vehicle(CUTTING_PLAYER)
  const started = run.watch.clock()
  const events = session.submit(tick, command, CUTTING_PLAYER)
  const elapsedMs = run.watch.clock() - started
  const after = session.vehicle(CUTTING_PLAYER)
  const movement = command.type === 'reportPose' ? command.payload.driveTicks : 0
  run.energy += before.energy - after.energy - movement * ENERGY_QUANTA_PER_TICK.drive
  run.lawWork += lawWorkOfGroundChanges(was, session.state().world, events, CUTTING_PLAYER)
  run.events.push(...events)
  return elapsedMs
}

function stepAt(bodyY: number): CommandIntent<'drillStep'> {
  return {
    type: 'drillStep',
    payload: { x: START.x, y: bodyY, facing: FACING.down, drive: { x: 0, y: -1 } },
  }
}

function reportAt(bodyY: number, ticks: number): CommandIntent<'reportPose'> {
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  const counts = { driveTicks: ticks, drillTicks: ticks, driving: ticks > 0, drilling: ticks > 0 }
  return {
    type: 'reportPose',
    payload: { ...payload, x: START.x, y: bodyY, ...counts, drive: { x: 0, y: -1 } },
  }
}

/** The tank filled to the rig's own capacity (`debug.setEnergy` refuses more). */
function refillOf(session: ScriptedSession): CommandIntent<'debug.setEnergy'> {
  const energyMax = statsOfVehicle(session.vehicle(CUTTING_PLAYER)).energyMax
  return { type: 'debug.setEnergy', payload: { energy: String(energyMax) } }
}
