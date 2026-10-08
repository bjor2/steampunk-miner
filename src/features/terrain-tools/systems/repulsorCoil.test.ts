import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isDiggableByStartingDrill } from '../../../systems/authority/magnet/magnetFixtures'
import { PARAMS, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { NEW_FIXED_STEP_CLOCK, stepsForFrame } from '../../../systems/fixedStepClock'
import { vehicleMotionAt } from '../../../systems/registries/vehicleMotionEffects'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell, type CellKind } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { chargesLeftOf, type PowerUpUse } from '../../power-up-core'
import { slice as TERRAIN_TOOLS_SLICE } from '../register'
import { hollowCaves, ofType, press, sessionWith, standAt } from '../terrainTestSession'
import { magnetBalanceOf, magnetItemOf } from './magnetItems'
import { releasePushWave, REPULSOR_COIL_ID } from './repulsorCoil'

// The repulsor coil (GD lock on #246, the repel verb; ticket 284): one push-wave per slot tap
// pushes the cells it reaches one cell outward into open cells through the kernel's magnet shift
// (#283), logs `magnet_used`, starts moving within 6 ticks of its act and never pushes the vehicle.
// The scenes are planet 1: the miner at rest underground, a wall two tiles east inside the wave's
// base radius of 2 and outside the 1 m anchors, and a cave hollowed one tile past it.

const COIL = { 'powerup.1': REPULSOR_COIL_ID }
const STAND_TICK = 5
const HOLLOW_TICK = 6
const PRESS_TICK = 10
const SETTLED_TICK = 40
const STEP_RATES = [30, 144] as const
/** "Its pull shows on the affected objects within 6 ticks" (G&V on #246, the GD lock). */
const RESPONSE_TICKS = 6
const BASE_RADIUS = 2

/** The miner's tile, the wall the wave reaches and the open cell past it. */
interface WaveScene {
  stand: TilePoint
  wall: TilePoint
  cave: TilePoint
}

/** A planet-1 scene with the wall `reach` tiles east of the miner, its cell of `kind`. */
function sceneEast(kind: CellKind, reach = BASE_RADIUS): WaveScene {
  for (let tx = 14; tx < 200; tx += 1) {
    for (let depth = 6; depth < 14; depth += 1) {
      const stand = { tx, ty: surfaceRowOfColumn(tx, PARAMS.radiusTiles) - depth }
      const scene = {
        stand,
        wall: { tx: tx + reach, ty: stand.ty },
        cave: { tx: tx + reach + 1, ty: stand.ty },
      }
      if (isSceneOf(kind, scene)) return scene
    }
  }
  throw new Error(`no buried ${kind} wall with ground past it`)
}

function isSceneOf(kind: CellKind, { stand, wall, cave }: WaveScene): boolean {
  const sameBand = bandOfTile(PARAMS, wall.tx, wall.ty) === bandOfTile(PARAMS, cave.tx, cave.ty)
  return (
    kindAt(stand) === CELL_KIND.ground &&
    kindAt(wall) === kind &&
    kindAt(cave) === CELL_KIND.ground &&
    sameBand &&
    isDiggableByStartingDrill(PARAMS, wall)
  )
}

function kindAt(tile: TilePoint): number {
  return kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile))
}

/** The miner at rest at the scene's stand, the coil slotted, the cave open (or not). */
function sessionAt(scene: WaveScene, isCaveOpen = true): ScriptedSession {
  const session = sessionWith(COIL)
  standAt(session, STAND_TICK, scene.stand, FACING.right)
  return isCaveOpen ? hollowCaves(session, HOLLOW_TICK, [scene.cave]) : session
}

function hasMoved(state: AuthorityState, { wall, cave }: WaveScene): boolean {
  return (
    cellAt(state.world, PARAMS, cave) === cellAt(EMPTY_WORLD, PARAMS, wall) &&
    kindOfCell(cellAt(state.world, PARAMS, wall)) === CELL_KIND.air
  )
}

function hasStayed(state: AuthorityState, { wall, cave }: WaveScene): boolean {
  return (
    cellAt(state.world, PARAMS, wall) === cellAt(EMPTY_WORLD, PARAMS, wall) &&
    kindOfCell(cellAt(state.world, PARAMS, cave)) === CELL_KIND.air
  )
}

/** The coil's wind-up: its act lands this many ticks after the press. */
function windupTicks(): number {
  const coil = magnetItemOf(REPULSOR_COIL_ID)
  if (coil === null) throw new Error('no repulsor coil row')
  return magnetBalanceOf(coil).windupTicks ?? 0
}

/** Steps the session in render frames at `rate` until the wall leaves its tile; that tick. */
function tickWallLeaves(session: ScriptedSession, scene: WaveScene, rate: number): number {
  let clock = NEW_FIXED_STEP_CLOCK
  let tick = session.state().tick
  while (tick < SETTLED_TICK) {
    const frame = stepsForFrame(clock, 1 / rate, 1 / TICKS_PER_SECOND, 8)
    clock = frame.clock
    tick += frame.steps
    session.advanceTo(tick)
    if (kindOfCell(cellAt(session.state().world, PARAMS, scene.wall)) !== kindAt(scene.wall)) {
      return tick
    }
  }
  throw new Error('the wall never moved')
}

function linesOf(session: ScriptedSession) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_284', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, session.events())
  return sink.events.filter((line) => (line.event as string) === 'terrain-tools.magnet_used')
}

/** Every ore cell gated `rig` and refused to every tool, as `canMine` refuses one. */
const RIG_GATE_PROBE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) =>
    r.gateCheck({
      id: 'gate-probe.rig',
      check: () => ({ outcome: 'refused', gateKind: 'rig', required: 'rig', have: 'none' }),
    }),
}

function useAt(stand: TilePoint, magnitude: number | null): PowerUpUse {
  return {
    playerId: 'p1',
    itemId: REPULSOR_COIL_ID,
    slot: 'powerup.1',
    tick: 20,
    origin: stand,
    mark: 0,
    magnitude,
  }
}

describe('repulsor coil', () => {
  it('pushes a diggable cell one cell outward into the open cell past it', () => {
    const scene = sceneEast(CELL_KIND.ground)
    const session = sessionAt(scene)
    session.submit(PRESS_TICK, press())
    session.advanceTo(SETTLED_TICK)
    expect(hasMoved(session.state(), scene)).toBe(true)
    expect(chargesLeftOf(session.state(), 'p1', REPULSOR_COIL_ID)).toBe(1)
  })

  it('logs magnet_used with the verb, the cells it moved and the energy they cost', () => {
    const scene = sceneEast(CELL_KIND.ground)
    const session = sessionAt(scene)
    const energyBefore = session.vehicle().energy
    session.submit(PRESS_TICK, press())
    session.advanceTo(PRESS_TICK + windupTicks())
    const spent = energyBefore - session.vehicle().energy
    const [used] = ofType(session.events(), 'terrain-tools.MagnetUsed')
    expect(used).toMatchObject({ itemId: REPULSOR_COIL_ID, verb: 'repel', cellsMoved: 1 })
    expect(used).toHaveProperty('energy', spent)
    expect(spent).toBeGreaterThan(0)
    const lines = linesOf(session)
    expect(lines.map((line) => line.data)).toEqual([
      { itemId: REPULSOR_COIL_ID, verb: 'repel', cellsMoved: 1, energy: spent },
    ])
    expect(lines.flatMap(runEventProblems)).toEqual([])
  })

  it.each(STEP_RATES)('starts the cell moving within 6 ticks of the act at %i steps/s', (rate) => {
    const scene = sceneEast(CELL_KIND.ground)
    const session = sessionAt(scene)
    session.submit(PRESS_TICK, press())
    const actTick = PRESS_TICK + windupTicks()
    session.advanceTo(actTick)
    expect(hasStayed(session.state(), scene)).toBe(true)
    const leaves = tickWallLeaves(session, scene, rate)
    expect(leaves - actTick).toBeLessThanOrEqual(RESPONSE_TICKS)
    session.advanceTo(SETTLED_TICK)
    expect(hasMoved(session.state(), scene)).toBe(true)
  })

  it('ends in the same world at 30 and 144 steps/s', () => {
    const [slow, fast] = STEP_RATES.map((rate) => {
      const scene = sceneEast(CELL_KIND.ground)
      const session = sessionAt(scene)
      session.submit(PRESS_TICK, press())
      tickWallLeaves(session, scene, rate)
      session.advanceTo(SETTLED_TICK)
      return session.state()
    })
    expect(fast.world).toEqual(slow.world)
    expect(fast.players).toEqual(slow.players)
  })

  it('never pushes the vehicle: its pose and its motion under the #233 cap are unchanged', () => {
    const scene = sceneEast(CELL_KIND.ground)
    const session = sessionAt(scene)
    session.submit(PRESS_TICK, press())
    const actTick = PRESS_TICK + windupTicks()
    session.advanceTo(actTick - 1)
    const before = session.state()
    session.advanceTo(actTick)
    const after = session.state()
    expect(ofType(session.events(), 'terrain-tools.MagnetUsed')).toHaveLength(1)
    expect(after.players.p1.vehicle.pose).toEqual(before.players.p1.vehicle.pose)
    expect(vehicleMotionAt(after, 'p1', actTick)).toEqual(vehicleMotionAt(before, 'p1', actTick))
  })

  it('is refused and costs nothing when no open cell lies past anything it reaches', () => {
    const scene = sceneEast(CELL_KIND.ground)
    const session = sessionAt(scene, false)
    const energyBefore = session.vehicle().energy
    session.submit(PRESS_TICK, press())
    session.advanceTo(SETTLED_TICK)
    expect(ofType(session.events(), 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: REPULSOR_COIL_ID, reason: 'terrain-tools.nothing_to_push' },
    ])
    expect(session.vehicle().energy).toBe(energyBefore)
    expect(chargesLeftOf(session.state(), 'p1', REPULSOR_COIL_ID)).toBe(2)
    expect(cellAt(session.state().world, PARAMS, scene.wall)).toBe(
      cellAt(EMPTY_WORLD, PARAMS, scene.wall),
    )
  })

  it('reaches as far as its Mark radius and no further', () => {
    const scene = sceneEast(CELL_KIND.ground, BASE_RADIUS + 1)
    const state = sessionAt(scene).state()
    expect(releasePushWave(state, useAt(scene.stand, BASE_RADIUS))).toMatchObject({
      kind: 'refused',
    })
    expect(releasePushWave(state, useAt(scene.stand, BASE_RADIUS + 1))).toMatchObject({
      kind: 'acted',
    })
  })

  it('leaves a rig-gated ore cell beside the wave, and the cave past it, byte-identical', () => {
    const scene = sceneEast(CELL_KIND.ore)
    const state = sessionAt(scene).state()
    expect(releasePushWave(state, useAt(scene.stand, null))).toMatchObject({ kind: 'acted' })
    withRegistrations([TERRAIN_TOOLS_SLICE, RIG_GATE_PROBE], () => {
      const outcome = releasePushWave(state, useAt(scene.stand, null))
      expect(outcome).toMatchObject({ kind: 'refused' })
      expect(hasStayed(state, scene)).toBe(true)
    })
  })
})
