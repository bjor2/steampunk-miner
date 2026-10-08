import { describe, expect, it } from 'vitest'
import { MAX_STEP_MM_PER_TICK } from '../../constants/balance'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateOutcome } from '../registries/gateChecks'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { NO_DRIVE, type DriveSigns } from '../vehicle/driveSigns'
import { FACING } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import { discSamplesOf } from '../world/stampShape'
import { EMPTY_WORLD } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import {
  createScriptedSession,
  dockInBay,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import { DRILL_CELLS_PER_TICK } from './sweptDrill'

// The swept cut (ticket 330): `drillStep` cuts every tick the drill is engaged, behind the dev
// flag `drill.sweptCut`, which only decides whether a client sends it.

/** A band-1 surface column east of the dock; the body starts 3 tiles above its surface. */
const COLUMN = 20
const SURFACE_TY = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
const START = { x: COLUMN * 1000 + 500, y: (SURFACE_TY + 3) * 1000 + 500 }

const stepTo = (x: number, y: number, drive: DriveSigns = NO_DRIVE) =>
  ({ type: 'drillStep', payload: { x, y, drive } }) as const

/** A session with a full tank, the body reported at `start` facing down at tick 0. */
function sessionFacingDownAt(start = START): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  session.submit(0, { type: 'reportPose', payload: { ...payload, x: start.x, y: start.y } })
  return session
}

/** One step a tick from tick 1, moving `mmPerTick` down each tick, for `ticks` ticks. */
function stepDown(session: ScriptedSession, mmPerTick: number, ticks: number, from = START) {
  for (let tick = 1; tick <= ticks; tick++) {
    session.submit(tick, stepTo(from.x, from.y - mmPerTick * tick))
  }
}

const rejectionsOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CommandRejected')

const tilesDestroyed = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'TileDestroyed')

describe('drill step (ticket 330)', () => {
  it('cuts the ground under a resting stamp every tick it is sent', () => {
    const session = sessionFacingDownAt({ x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 })
    for (let tick = 1; tick <= 30; tick++) {
      session.submit(tick, stepTo(START.x, (SURFACE_TY + 1) * 1000 + 400))
    }
    const damage = session.events().filter((event) => event.type === 'DrillDamageDealt')
    expect(rejectionsOf(session.events())).toEqual([])
    expect(damage.length).toBeGreaterThanOrEqual(24)
    expect(tilesDestroyed(session.events()).length).toBeGreaterThan(0)
    expect(session.vehicle().sweptCut?.tick).toBe(30)
  })

  it('charges the drill only for the ticks it cut', () => {
    const session = sessionFacingDownAt()
    const before = session.vehicle().energy
    stepDown(session, 0, 5)
    expect(before - session.vehicle().energy).toBe(0)
    const near = { x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 }
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
    session.submit(7, { type: 'reportPose', payload: { ...payload, ...near } })
    const charged = session.vehicle().energy
    session.submit(8, stepTo(near.x, near.y))
    expect(charged - session.vehicle().energy).toBe(ENERGY_QUANTA_PER_TICK.drill)
  })

  it('refuses a second step in one tick', () => {
    const session = sessionFacingDownAt()
    session.submit(1, stepTo(START.x, START.y))
    const [answer] = session.submit(1, stepTo(START.x, START.y))
    expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'too_many_ticks' })
  })

  it('refuses a step further than the pose bound from the last accepted position', () => {
    const session = sessionFacingDownAt()
    expect(session.submit(1, stepTo(START.x, START.y - MAX_STEP_MM_PER_TICK))).not.toContainEqual(
      expect.objectContaining({ type: 'CommandRejected' }),
    )
    const [answer] = session.submit(2, stepTo(START.x, START.y - 2 * MAX_STEP_MM_PER_TICK - 1))
    expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'invalid_pose' })
    const later = session.submit(3, stepTo(START.x, START.y - 3 * MAX_STEP_MM_PER_TICK))
    expect(rejectionsOf(later)).toEqual([])
  })

  it('refuses a step from a docked vehicle', () => {
    const session = createScriptedSession()
    dockInBay(session, 0, 'sell')
    const { x, y } = session.vehicle().pose ?? { x: 0, y: 0 }
    const [answer] = session.submit(1, stepTo(x, y))
    expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'vehicle_not_active' })
  })

  it('leaves a report whose drill ticks the steps cut to charge movement alone', () => {
    const session = sessionFacingDownAt()
    stepDown(session, 100, 12)
    const before = session.vehicle()
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down, { drillTicks: 12, driveTicks: 12 })
    const events = session.submit(12, {
      type: 'reportPose',
      payload: { ...payload, x: START.x, y: START.y - 1200 },
    })
    expect(events.filter((event) => event.type === 'DrillDamageDealt')).toEqual([])
    expect(before.energy - session.vehicle().energy).toBe(12 * ENERGY_QUANTA_PER_TICK.drive)
  })

  it('cuts by the report as before when no step was sent since the last report', () => {
    const session = sessionFacingDownAt({ x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 })
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down, { drillTicks: 12 })
    const events = session.submit(12, {
      type: 'reportPose',
      payload: { ...payload, x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 },
    })
    expect(events.filter((event) => event.type === 'DrillDamageDealt')).toHaveLength(1)
  })

  it('gives the same digest replayed twice and across a snapshot', () => {
    const run = () => {
      const session = sessionFacingDownAt()
      stepDown(session, 250, 60)
      return session
    }
    const first = run()
    expect(stateDigest(first.state())).toBe(stateDigest(run().state()))
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(first.state()))))
    expect('state' in restored && stateDigest(restored.state)).toBe(stateDigest(first.state()))
  })

  it('lays casing rings half a metre apart along a fast cut', () => {
    const session = sessionFacingDownAt()
    stepDown(session, MAX_STEP_MM_PER_TICK, 50)
    const rings = session.events().filter((event) => event.type === 'CasingPlaced')
    const trail = session.vehicle().casingTrail
    expect(rings.length).toBeGreaterThanOrEqual(20)
    const axis = trail.unlined.map((point) => point.yMm)
    for (let index = 1; index < axis.length; index++)
      expect(axis[index - 1] - axis[index]).toBe(500)
  })
})

/** A fake slice whose gate check answers `outcome` for every ore cell (feature-slices.md 3.6). */
function gateSliceOf(outcome: GateOutcome): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: 'gate-probe.every-ore',
        check: () => ({ outcome, gateKind: 'probe', required: 'probe-rig', have: 'none' }),
      }),
  }
}

/** The tiles of the `DrillGated` events, one entry per event. */
function gatedTilesOf(events: readonly DomainEvent[]): string[] {
  return events.flatMap((event) => (event.type === 'DrillGated' ? [`${event.tx},${event.ty}`] : []))
}

describe('drill step gates (ticket 330, Horizontal Scaler)', () => {
  const [gated] = surfaceOreTiles(1)
  const above = { x: gated.tx * 1000 + 500, y: (gated.ty + 4) * 1000 + 500 }
  const below: TilePoint = { tx: gated.tx, ty: gated.ty - 1 }

  function sweepThroughGateAtTheBound(outcome: GateOutcome = 'refused') {
    return withRegistrations([gateSliceOf(outcome)], () => {
      const session = sessionFacingDownAt(above)
      stepDown(session, MAX_STEP_MM_PER_TICK, 30, above)
      return session
    })
  }

  it('refuses a gated cell inside the capsule at 18 m/s and stops the sweep before it', () => {
    const session = sweepThroughGateAtTheBound()
    expect(gatedTilesOf(session.events())).toContain(`${gated.tx},${gated.ty}`)
    const world = session.state().world
    expect(cellDensitySum(world, PARAMS, gated)).toBe(cellDensitySum(EMPTY_WORLD, PARAMS, gated))
    expect(cellDensitySum(world, PARAMS, below)).toBe(cellDensitySum(EMPTY_WORLD, PARAMS, below))
    const centre = session.vehicle().sweptCut?.yMm ?? 0
    expect(centre).toBeGreaterThanOrEqual((gated.ty + 1) * 1000)
    expect(centre).toBeLessThan((gated.ty + 1) * 1000 + 125)
  })

  it('cuts past the same cell when no gate holds it', () => {
    const world = sweepThroughGateAtTheBound('cut').state().world
    expect(cellDensitySum(world, PARAMS, below)).toBeLessThan(
      cellDensitySum(EMPTY_WORLD, PARAMS, below),
    )
  })

  it('reports each gated cell once while the drill presses on it', () => {
    const tiles = gatedTilesOf(sweepThroughGateAtTheBound().events())
    expect(tiles.length).toBeGreaterThan(0)
    expect(new Set(tiles).size).toBe(tiles.length)
  })
})

describe('drill step yield per metre (ticket 330, Vertical Scaler)', () => {
  const top = { x: START.x, y: (SURFACE_TY + 1) * 1000 + 600 }
  const METRES = 8

  /** The same scripted descent cut by 5 Hz reports alone, or by a step every tick beside them. */
  function descend(isStepped: boolean, mmPerTick: number) {
    const session = sessionFacingDownAt(top)
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down, { drillTicks: 12 })
    for (let tick = 1; tick <= (METRES * 1000) / mmPerTick; tick++) {
      const y = top.y - mmPerTick * tick
      if (isStepped) session.submit(tick, stepTo(top.x, y))
      if (tick % 12 !== 0) continue
      session.submit(tick, { type: 'reportPose', payload: { ...payload, x: top.x, y } })
      session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    }
    const events = session.events()
    const drillTicks = events.reduce(
      (sum, event) => sum + (event.type === 'DrillDamageDealt' ? event.ticks : 0),
      0,
    )
    const opened = tilesDestroyed(events).map((event) => `${event.tx},${event.ty}`)
    return { opened: opened.sort(), drillTicks }
  }

  it.each([10, 40])('opens the same cells per metre at %i mm a tick', (mmPerTick) => {
    const reported = descend(false, mmPerTick)
    const stepped = descend(true, mmPerTick)
    expect(reported.opened.length).toBeGreaterThanOrEqual(METRES)
    expect(stepped.opened).toEqual(reported.opened)
  })

  it.each([10, 40])('spends the same energy per cell, within 5%, at %i mm a tick', (mmPerTick) => {
    const reported = descend(false, mmPerTick)
    const stepped = descend(true, mmPerTick)
    const perCell = (run: typeof reported) => run.drillTicks / run.opened.length
    expect(Math.abs(perCell(stepped) / perCell(reported) - 1)).toBeLessThanOrEqual(0.05)
  })

  it('opens no cell farther from the swept path than the stamp reaches', () => {
    const { opened } = descend(true, 40)
    // The stamp's centre ran straight down x = top.x from 0.5 m below the start to the end.
    const path = { x: top.x, yTop: top.y - 500, yBottom: top.y - 500 - METRES * 1000 }
    for (const key of opened) {
      const [tx, ty] = key.split(',').map(Number)
      const dx = Math.max(0, tx * 1000 - path.x, path.x - (tx + 1) * 1000)
      const dy = Math.max(0, ty * 1000 - path.yTop, path.yBottom - (ty + 1) * 1000)
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(950)
    }
  })
})

describe('drill step terrain budget (ticket 330)', () => {
  const [gated] = surfaceOreTiles(1)
  const above = { x: gated.tx * 1000 + 500, y: (gated.ty + 4) * 1000 + 500 }
  const OPENS_AT_TICK = 40
  const TICKS = 70

  /** A gate that holds every ore cell until `OPENS_AT_TICK`, so the cursor falls metres behind. */
  const lateGate: SliceDefinition = {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: 'gate-probe.late',
        check: ({ state }) => ({
          outcome: state.tick < OPENS_AT_TICK ? 'refused' : 'cut',
          gateKind: 'probe',
          required: 'time',
          have: 'none',
        }),
      }),
  }

  /** The cursor after each step, from the tick the gate opens. */
  function catchUpAfterTheGate() {
    return withRegistrations([lateGate], () => {
      const session = sessionFacingDownAt(above)
      const cursors: { xMm: number; yMm: number }[] = []
      for (let tick = 1; tick <= TICKS; tick++) {
        session.submit(tick, stepTo(above.x, above.y - MAX_STEP_MM_PER_TICK * tick))
        const cursor = session.vehicle().sweptCut
        if (tick >= OPENS_AT_TICK - 1 && cursor !== undefined) cursors.push(cursor)
      }
      return { session, cursors }
    })
  }

  function cellsBetween(from: { xMm: number; yMm: number }, to: { xMm: number; yMm: number }) {
    const capsule = { ...to, radiusMm: 950, floorRadiusMm: null, tail: from }
    return new Set(discSamplesOf(capsule).map(({ sx, sy }) => `${sx >> 2},${sy >> 2}`)).size
  }

  it('touches at most 32 density cells a tick, however far the cursor fell behind', () => {
    const { cursors } = catchUpAfterTheGate()
    expect(DRILL_CELLS_PER_TICK).toBe(32)
    const lag = cursors[0].yMm - cursors[1].yMm
    expect(lag).toBeGreaterThan(0)
    for (let index = 1; index < cursors.length; index++) {
      expect(cellsBetween(cursors[index - 1], cursors[index])).toBeLessThanOrEqual(32)
    }
  })

  it('stops a sweep over the budget and resumes it next tick until it reaches the stamp', () => {
    const { session, cursors } = catchUpAfterTheGate()
    const headAtOpening = above.y - MAX_STEP_MM_PER_TICK * OPENS_AT_TICK - 500
    expect(cursors[1].yMm).toBeGreaterThan(headAtOpening)
    expect(session.vehicle().sweptCut?.yMm).toBe(above.y - MAX_STEP_MM_PER_TICK * TICKS - 500)
    const world = session.state().world
    for (let ty = gated.ty - 1; ty > gated.ty - 12; ty--) {
      const tile = { tx: gated.tx, ty }
      expect(cellDensitySum(world, PARAMS, tile)).toBeLessThan(
        cellDensitySum(EMPTY_WORLD, PARAMS, tile),
      )
    }
  })
})
