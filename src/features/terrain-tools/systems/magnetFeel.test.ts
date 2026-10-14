import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { buildWeakTunnel } from '../../../systems/authority/collapse/collapseFixtures'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { isDiggableByStartingDrill } from '../../../systems/authority/magnet/magnetFixtures'
import {
  continueScriptedSession,
  createScriptedSession,
  dockInBay,
  PARAMS,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { ECONOMY } from '../../../systems/economy/economy'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame } from '../../../systems/fixedStepClock'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import type { PowerUpUse } from '../../power-up-core'
import { slice as TERRAIN_TOOLS_SLICE } from '../register'
import { buriedTile, hollowCaves, ofType, press, sessionWith, standAt } from '../terrainTestSession'
import { LODE_CLAMP_ID } from './lodeClamp'
import { LODESTONE_BEACON_ID } from './lodestoneBeacon'
import { REPULSOR_COIL_ID } from './repulsorCoil'
import { TERRAIN_POWER_UPS } from './terrainPowerUps'
import { terrainToolsOf } from './terrainSection'

// The magnet fields' feel (G&V's testable feel acceptance on #246, taken into the GD lock; build 5,
// ticket 286), for each of the family's three verbs as it ships:
// - attract, the lodestone beacon: its field acts at the owner's dock (#202), and the gather's
//   first swap lands within 6 ticks of the `DockEntered`;
// - repel, the repulsor coil: the push-wave's first cell leaves its tile within 6 ticks of the act;
// - anchor, the lode clamp: it moves nothing, so what it affects is the collapse block it braces,
//   and the brace takes hold within 6 ticks of the act.
// Beside each field a solid gated cell and a core cell stay byte-identical, and no field ever
// drives the vehicle past the #233 motion cap, nor moves it at all. The clocks run in render
// frames at 30 and 144 a second; every scene is planet 1.

const STEP_RATES = [30, 144] as const
/** "Its pull shows on the affected objects within 6 ticks" (G&V on #246, the GD lock). */
const RESPONSE_TICKS = 6
const MOTION_CAP_BP = ECONOMY.itemEffectCaps.motionBoostCapBp
/** The longest any scene waits for a response before it fails. */
const GIVE_UP_TICKS = 60

const VERBS = ['attract', 'repel', 'anchor'] as const
type Verb = (typeof VERBS)[number]

const ITEM_OF: Readonly<Record<Verb, string>> = {
  attract: LODESTONE_BEACON_ID,
  repel: REPULSOR_COIL_ID,
  anchor: LODE_CLAMP_ID,
}

/** A field ready to go: its session, its trigger, the tick it starts acting, what shows it. */
interface FieldRun {
  session: ScriptedSession
  /** The tick the trigger (a slot press or the dock) is sent. */
  triggerTick: number
  trigger(session: ScriptedSession): void
  /** The tick the field starts acting: the act for the slot items, the dock for the beacon. */
  fieldTick(session: ScriptedSession): number
  hasResponded(session: ScriptedSession): boolean
}

const PRESS_TICK = 20
const DOCK_TICK = 40

// --- attract: plant the beacon 12 tiles down, then dock --------------------------------------

function attractRun(): FieldRun {
  const session = sessionWith({ 'powerup.1': LODESTONE_BEACON_ID })
  standAt(session, 5, buriedTile(12), FACING.right)
  session.submit(10, press())
  return {
    session,
    triggerTick: DOCK_TICK,
    trigger: (run) => dockInBay(run, DOCK_TICK, 'sell'),
    fieldTick: (run) => firstTickOf(run, 'DockEntered'),
    hasResponded: (run) => groundChangedSince(run, DOCK_TICK),
  }
}

// --- repel: a diggable wall two tiles east of the miner, a cave hollowed past it ---------------

interface WaveScene {
  stand: TilePoint
  wall: TilePoint
  cave: TilePoint
}

function repelRun(): FieldRun {
  const scene = waveScene()
  const stood = sessionWith({ 'powerup.1': REPULSOR_COIL_ID })
  standAt(stood, 5, scene.stand, FACING.right)
  return {
    session: hollowCaves(stood, 6, [scene.cave]),
    triggerTick: PRESS_TICK,
    trigger: pressAtTrigger,
    fieldTick: (run) => firstTickOf(run, 'terrain-tools.MagnetUsed'),
    hasResponded: (run) => groundChangedSince(run, PRESS_TICK),
  }
}

function waveScene(): WaveScene {
  for (let tx = 14; tx < 200; tx += 1) {
    for (let depth = 6; depth < 14; depth += 1) {
      const stand = buriedTile(depth, tx)
      const scene = {
        stand,
        wall: { tx: tx + 2, ty: stand.ty },
        cave: { tx: tx + 3, ty: stand.ty },
      }
      if (isWaveScene(scene)) return scene
    }
  }
  throw new Error('no buried ground wall with ground past it')
}

function isWaveScene({ stand, wall, cave }: WaveScene): boolean {
  const isGround = (tile: TilePoint) => generatedKindAt(tile) === CELL_KIND.ground
  const isSameBand = bandOfTile(PARAMS, wall.tx, wall.ty) === bandOfTile(PARAMS, cave.tx, cave.ty)
  return (
    [stand, wall, cave].every(isGround) && isSameBand && isDiggableByStartingDrill(PARAMS, wall)
  )
}

// --- anchor: the collapse specs' weak tunnel, warning from tick 10, the clamp held -------------

function anchorRun(): FieldRun {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': LODE_CLAMP_ID }))
  buildWeakTunnel(session, 10)
  return {
    session,
    triggerTick: PRESS_TICK,
    trigger: pressAtTrigger,
    fieldTick: (run) => terrainToolsOf(run.state(), 'p1').clamp?.startTick ?? Infinity,
    hasResponded: (run) => ofType(run.events(), 'CollapseBraced').length > 0,
  }
}

const RUN_OF: Readonly<Record<Verb, () => FieldRun>> = {
  attract: attractRun,
  repel: repelRun,
  anchor: anchorRun,
}

function pressAtTrigger(session: ScriptedSession): void {
  session.submit(PRESS_TICK, press())
}

/** The run with its trigger sent. */
function triggered(run: FieldRun): FieldRun {
  run.trigger(run.session)
  return run
}

// --- reads ----------------------------------------------------------------------------------

function generatedKindAt(tile: TilePoint): number {
  return kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile))
}

function groundChangedSince(session: ScriptedSession, tick: number): boolean {
  return ofType(session.events(), 'GroundChanged').some((event) => event.tick >= tick)
}

function firstTickOf(session: ScriptedSession, type: string): number {
  const [first] = ofType(session.events(), type)
  return first?.tick ?? Infinity
}

/** Steps the run in render frames at `rate` from its trigger until it responds; that tick. */
function tickRespondedAt(run: FieldRun, rate: number): number {
  let clock = NEW_FIXED_STEP_CLOCK
  let tick = run.triggerTick
  while (tick < run.triggerTick + GIVE_UP_TICKS) {
    const frame = stepsForFrame(clock, 1 / rate, 1 / TICKS_PER_SECOND, 8)
    clock = frame.clock
    tick += frame.steps
    run.session.advanceTo(tick)
    if (run.hasResponded(run.session)) return firstResponseTick(run)
  }
  throw new Error('the field never moved anything')
}

/** The first tick the response shows in the events, however many ticks the last frame stepped. */
function firstResponseTick(run: FieldRun): number {
  const types = ['GroundChanged', 'CollapseBraced']
  return Math.min(
    ...run.session
      .events()
      .filter((event) => types.includes(event.type) && event.tick >= run.triggerTick)
      .map((event) => event.tick),
  )
}

// --- gated and core cells beside a field ------------------------------------------------------

/** How far the miner stands left of the fixed cell: inside the wave's and the clamp's radius 2. */
const STAND_OFFSET = 2
/** A cave this far above the miner gives the wave a diggable cell to push (radius 2, then out). */
const CAVE_ABOVE = 3

/** Every ore cell gated `rig` and refused to every tool, as `canMine` refuses one. */
const RIG_GATE_PROBE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.rig',
      check: () => ({ outcome: 'refused', gateKind: 'rig', required: 'rig', have: 'none' }),
    }),
}

/** A fixed cell with the field used two tiles left of it, and what else holds there. */
interface FixedScene {
  target: TilePoint
  slices: readonly SliceDefinition[]
  /** The cell kinds no field may change in this scene. */
  fixedKinds: readonly number[]
  /** Caves hollowed before the use, so the field has something it may move. */
  caves: readonly TilePoint[]
}

/** A buried ore cell gated by the probe, a cave east of it and one above the miner. */
function gatedScene(): FixedScene {
  const target = buriedOreTile()
  return {
    target,
    slices: [TERRAIN_TOOLS_SLICE, RIG_GATE_PROBE],
    fixedKinds: [CELL_KIND.ore, CELL_KIND.core],
    caves: [{ tx: target.tx + 1, ty: target.ty }, caveAbove(standOf(target))],
  }
}

/** The core's west edge on row 0, ungated ore round it, a cave above the miner. */
function coreScene(): FixedScene {
  const target = coreEdgeTile()
  return {
    target,
    slices: [TERRAIN_TOOLS_SLICE],
    fixedKinds: [CELL_KIND.core],
    caves: [caveAbove(standOf(target))],
  }
}

const SCENE_OF = { gated: gatedScene, core: coreScene } as const

function standOf(target: TilePoint): TilePoint {
  return { tx: target.tx - STAND_OFFSET, ty: target.ty }
}

function caveAbove(stand: TilePoint): TilePoint {
  return { tx: stand.tx, ty: stand.ty + CAVE_ABOVE }
}

function buriedOreTile(): TilePoint {
  for (let tx = 20; tx < 400; tx += 1) {
    const top = surfaceRowOfColumn(tx, PARAMS.radiusTiles)
    for (let ty = top - 6; ty > top - 14; ty -= 1) {
      if (generatedKindAt({ tx, ty }) === CELL_KIND.ore) return { tx, ty }
    }
  }
  throw new Error('no buried ore on planet 1')
}

function coreEdgeTile(): TilePoint {
  const reach = PARAMS.coreRadiusTiles
  for (let tx = -reach; tx <= 0; tx += 1) {
    if (generatedKindAt({ tx, ty: 0 }) === CELL_KIND.core) return { tx, ty: 0 }
  }
  throw new Error('no core on row 0')
}

/** The scene's target and those of its eight neighbours that are fixed too, in `state`. */
function fixedCellsAround(state: AuthorityState, scene: FixedScene): TilePoint[] {
  const { target, fixedKinds } = scene
  const tiles: TilePoint[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) tiles.push({ tx: target.tx + dx, ty: target.ty + dy })
  }
  return tiles.filter((tile) => fixedKinds.includes(kindOfCell(cellAt(state.world, PARAMS, tile))))
}

function cellsOf(state: AuthorityState, tiles: readonly TilePoint[]): number[] {
  return tiles.map((tile) => cellAt(state.world, PARAMS, tile))
}

/** The miner left of the scene's target with the verb's item, its caves hollowed, ready to use. */
function standBeside(verb: Verb, scene: FixedScene): AuthorityState {
  const stood = sessionWith({ 'powerup.1': ITEM_OF[verb] })
  standAt(stood, 5, standOf(scene.target), FACING.right)
  const session = hollowCaves(stood, 6, scene.caves)
  session.advanceTo(PRESS_TICK)
  return session.state()
}

/**
 * The verb's act through the item's own power-up, as `gatesFixture` uses it (the fresh registry set
 * holds no `power-up-core` press path), then the world run on until the field is done: the beacon
 * docked on, the wave's moves landed, the clamp's field held out. Answers null if it did not act.
 */
function runFieldOut(verb: Verb, state: AuthorityState, target: TilePoint): AuthorityState | null {
  const powerUp = TERRAIN_POWER_UPS.find((candidate) => candidate.itemId === ITEM_OF[verb])
  if (powerUp === undefined) throw new Error(`${ITEM_OF[verb]} is not shipped`)
  const outcome = powerUp.activate(state, powerUpUseOf(verb, standOf(target)))
  if (outcome.kind !== 'acted') return null
  const session = continueScriptedSession(outcome.effect.state)
  if (verb === 'attract') dockInBay(session, DOCK_TICK, 'sell')
  session.advanceTo(DOCK_TICK + GIVE_UP_TICKS)
  return session.state()
}

function powerUpUseOf(verb: Verb, origin: TilePoint): PowerUpUse {
  const itemId = ITEM_OF[verb]
  return {
    playerId: 'p1',
    itemId,
    slot: 'powerup.1',
    tick: PRESS_TICK,
    origin,
    mark: 0,
    magnitude: null,
  }
}

function pinnedCellsOf(state: AuthorityState): readonly TilePoint[] {
  return terrainToolsOf(state, 'p1').clamp?.cells ?? []
}

// --- the vehicle under a field ----------------------------------------------------------------

/** Every tick from the trigger to the run's end on which the field drives past the cap. */
function ticksOverTheCap(run: FieldRun, lastTick: number): number[] {
  const over: number[] = []
  for (let tick = run.triggerTick; tick <= lastTick; tick += 1) {
    run.session.advanceTo(tick)
    if (isOverTheCap(run.session.state(), tick)) over.push(tick)
  }
  return over
}

function isOverTheCap(state: AuthorityState, tick: number): boolean {
  const motion = vehicleMotionAt(state, 'p1', tick)
  const isBoostOver = Math.max(motion.liftBoostBp, motion.driveBoostBp) > MOTION_CAP_BP
  return isBoostOver || motion.burst !== null || motion.reelTo !== null
}

describe('magnet fields: feel', () => {
  it.each(VERBS.flatMap((verb) => STEP_RATES.map((rate) => [verb, rate] as const)))(
    '%s: an affected object starts moving within 6 ticks, at %i steps/s',
    (verb, rate) => {
      const run = triggered(RUN_OF[verb]())
      const responded = tickRespondedAt(run, rate)
      const fieldTick = run.fieldTick(run.session)
      expect(responded).toBeGreaterThanOrEqual(fieldTick)
      expect(responded - fieldTick).toBeLessThanOrEqual(RESPONSE_TICKS)
    },
  )

  it.each(
    VERBS.flatMap((verb) => (['gated', 'core'] as const).map((kind) => [verb, kind] as const)),
  )('%s: a solid %s cell beside the field is byte-identical', (verb, kind) => {
    const scene = SCENE_OF[kind]()
    withRegistrations(scene.slices, () => {
      const before = standBeside(verb, scene)
      const fixed = fixedCellsAround(before, scene)
      expect(fixed).toContainEqual(scene.target)
      const after = runFieldOut(verb, before, scene.target)
      if (after === null) throw new Error(`the ${verb} field did not act`)
      expect(cellsOf(after, fixed)).toEqual(cellsOf(before, fixed))
      expect(pinnedCellsOf(after)).not.toContainEqual(scene.target)
    })
  })

  it.each(VERBS)('%s: vehicle speed under the field never exceeds the #233 cap', (verb) => {
    const run = RUN_OF[verb]()
    const pose = run.session.state().players.p1.vehicle.pose
    run.trigger(run.session)
    const lastTick = run.triggerTick + GIVE_UP_TICKS
    expect(ticksOverTheCap(run, lastTick)).toEqual([])
    expect(run.fieldTick(run.session)).toBeLessThanOrEqual(lastTick)
    if (verb !== 'attract') expect(run.session.state().players.p1.vehicle.pose).toEqual(pose)
  })
})
