import { describe, expect, it } from 'vitest'
import {
  CUT_FACE_MARGIN_MM,
  DRILL_STAMP_AHEAD_MM,
  STEP_BOUND_TOLERANCE_MM,
} from '../../constants/balance'
import { sweptStampAheadMmOf } from '../vehicle/drillStamp'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateOutcome } from '../registries/gateChecks'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { NO_DRIVE, type DriveSigns } from '../vehicle/driveSigns'
import { frontOfCursor, type SweptCut } from '../vehicle/sweptCut'
import { FACING, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import { EMPTY_WORLD, materialCellAt } from '../world/worldState'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { cellDigEnergyOf } from './cellDigEnergy'
import { withSweptLawCharge } from './cutCarryFixtures'
import { drillSubStepsOfCells } from './groundDrill'
import type { CommandIntent } from './authorityCommand'
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
import { stepBoundsAt } from './stepBoundRead'
import { DRILL_CELLS_PER_TICK } from './cutShare'
import { poseRidingFront } from './faceHoldFixtures'

// The swept cut (ticket 330): `drillStep` cuts every tick the drill is engaged, behind the dev
// flag `drill.sweptCut`, which only decides whether a client sends it.

/** A band-1 surface column east of the dock; the body starts 3 tiles above its surface. */
const COLUMN = 20
const SURFACE_TY = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
const START = { x: COLUMN * 1000 + 500, y: (SURFACE_TY + 3) * 1000 + 500 }

const stepTo = (x: number, y: number, drive: DriveSigns = NO_DRIVE, facing: number = FACING.down) =>
  ({ type: 'drillStep', payload: { x, y, facing, drive } }) as const

/** A session with a full tank, the body reported at `start` facing down at tick 0. */
function sessionFacingDownAt(start = START): ScriptedSession {
  return sessionReportedAt(start, FACING.down)
}

/** A session with a full tank, the body reported at `start` facing `facing` at tick 0. */
function sessionReportedAt(start: { x: number; y: number }, facing: Facing): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, facing)
  session.submit(0, { type: 'reportPose', payload: { ...payload, x: start.x, y: start.y } })
  return session
}

/**
 * `sessionFacingDownAt` with a drill that breaks band-1 ground in about 4 ticks (stored step 200,
 * the old tile floor's pace; ticket 397 took the floor out of the law) and a deep tank: the level-0
 * drill takes 40 ticks a cell, and since ticket 399 the cut reaches only as far as its work pays
 * for.
 */
function strongSessionFacingDownAt(start = START): ScriptedSession {
  const session = sessionFacingDownAt(start)
  session.submit(0, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: 12 },
  })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '100000' } })
  return session
}

/** One step a tick from tick 1, moving `mmPerTick` down each tick, for `ticks` ticks. */
function stepDown(session: ScriptedSession, mmPerTick: number, ticks: number, from = START) {
  for (let tick = 1; tick <= ticks; tick++) {
    session.submit(tick, stepTo(from.x, from.y - mmPerTick * tick))
  }
}

/** The level-0 rig's stats-derived bounds on band-1 ground (ticket 334). */
const BOUNDS = stepBoundsAt(sessionFacingDownAt().state(), 'p1')
/** The longest step a cutting rig may take: every scripted descent here keeps to it. */
const CUT_STEP_MM = BOUNDS.cuttingMm
/** The swept stamp's centre sat this far ahead of the pose before ticket 570: a report's, plus the cutting bound. */
const SWEPT_AHEAD_MM = DRILL_STAMP_AHEAD_MM + CUT_STEP_MM
/** The furthest a resting body's front stands ahead of it (ticket 570): its step, margin and ramp, and the margin it may win back. */
const SWEPT_REACH_MAX_MM = sweptStampAheadMmOf(CUT_STEP_MM) + CUT_FACE_MARGIN_MM + 125

function frontOfCursorOf(cursor: SweptCut | undefined) {
  if (cursor === undefined) throw new Error('no cut was made')
  return frontOfCursor(cursor)
}

const rejectionsOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CommandRejected')

const tilesDestroyed = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'TileDestroyed')

/**
 * One step a tick from `firstTick` for `ticks` ticks, the body riding its cut's front along
 * `facing` (ticket 570: a live body moves into what its last step cut, never further).
 */
function rideCut(session: ScriptedSession, from: { x: number; y: number }, ride: RideFor) {
  let body = from
  for (let tick = ride.firstTick; tick < ride.firstTick + ride.ticks; tick++) {
    session.submit(tick, stepTo(body.x, body.y, NO_DRIVE, ride.facing))
    const pose = { ...(session.vehicle().pose as VehiclePose), ...body, facing: ride.facing }
    body = poseRidingFront(pose, session.vehicle().sweptCut)
  }
}

/** How long a ride lasts, from which tick, and along which facing. */
interface RideFor {
  firstTick: number
  ticks: number
  facing: Facing
}

const RIDE_DOWN_50: RideFor = { firstTick: 1, ticks: 50, facing: FACING.down }

describe('drill step (ticket 330)', () => {
  // The level-0 drill pays a band-1 cell in its full 40 ticks (ticket 399), so the rest is longer.
  it('cuts the ground ahead of a body riding its cut every tick it is sent', () => {
    const near = { x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 }
    const session = sessionFacingDownAt(near)
    rideCut(session, near, RIDE_DOWN_50)
    const damage = session.events().filter((event) => event.type === 'DrillDamageDealt')
    expect(rejectionsOf(session.events())).toEqual([])
    expect(damage.length).toBeGreaterThanOrEqual(40)
    expect(tilesDestroyed(session.events()).length).toBeGreaterThan(0)
    expect(session.vehicle().sweptCut?.tick).toBe(50)
  })

  // Ticket 570: the cut reaches where the body will be after its step, never a bound ahead, so a
  // body that rests opens no more ground once its step is cut.
  it('cuts no further than the step a resting body may take', () => {
    const near = { x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 }
    const session = sessionFacingDownAt(near)
    const changedAt: number[] = []
    for (let tick = 1; tick <= 50; tick++) {
      const events = session.submit(tick, stepTo(near.x, near.y))
      if (events.some((event) => event.type === 'GroundChanged')) changedAt.push(tick)
    }
    expect(changedAt.length).toBeGreaterThan(0)
    expect(Math.max(...changedAt)).toBeLessThan(15)
    const cursor = session.vehicle().sweptCut
    expect(near.y - frontOfCursorOf(cursor).yMm).toBeLessThanOrEqual(SWEPT_REACH_MAX_MM)
  })

  // The per-cell price is the kill-switch's off path (`drill.sweptLawCharge`, on since 18 Oct 2026).
  it('charges each cell it breaks its own dig energy, and nothing for ground it only wears, law charge off', () =>
    withSweptLawCharge(false, chargesEachCell))

  function chargesEachCell() {
    const session = sessionFacingDownAt()
    const before = session.vehicle().energy
    stepDown(session, 0, 5)
    expect(before - session.vehicle().energy).toBe(0)
    const near = { x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 }
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
    session.submit(7, { type: 'reportPose', payload: { ...payload, ...near } })
    const charged = session.vehicle().energy
    session.submit(8, stepTo(near.x, near.y))
    expect(tilesDestroyed(session.submit(9, stepTo(near.x, near.y)))).toEqual([])
    expect(charged - session.vehicle().energy).toBe(0)
    rideCut(session, near, { firstTick: 10, ticks: 71, facing: FACING.down })
    const broken = tilesDestroyed(session.events())
    const subStepsOf = drillSubStepsOfCells(PARAMS, statsOfVehicle(session.vehicle()), () => 0)
    const energyOf = (event: (typeof broken)[number]) => {
      const tile = { tx: event.tx, ty: event.ty }
      return cellDigEnergyOf(subStepsOf(tile, materialCellAt(EMPTY_WORLD, PARAMS, tile), 0) ?? 0)
    }
    expect(broken.length).toBeGreaterThan(0)
    expect(charged - session.vehicle().energy).toBe(
      broken.reduce((sum, event) => sum + energyOf(event), 0),
    )
  }

  it('refuses a second step in one tick', () => {
    const session = sessionFacingDownAt()
    session.submit(1, stepTo(START.x, START.y))
    const [answer] = session.submit(1, stepTo(START.x, START.y))
    expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'too_many_ticks' })
  })

  it('refuses a travelling step past the bound from the last accepted position', () => {
    const session = sessionFacingDownAt()
    const travel = BOUNDS.travellingMm
    expect(rejectionsOf(session.submit(1, stepTo(START.x, START.y - travel)))).toEqual([])
    const [answer] = session.submit(2, stepTo(START.x, START.y - 2 * travel - 1))
    expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'invalid_pose' })
    const later = session.submit(3, stepTo(START.x, START.y - 3 * travel))
    expect(rejectionsOf(later)).toEqual([])
  })

  it('accepts a cutting step at the bound and refuses one a sample past it', () => {
    const near = { x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 }
    const run = (stepMm: number) => {
      const session = sessionFacingDownAt(near)
      session.submit(1, stepTo(near.x, near.y))
      expect(session.vehicle().sweptCut?.cutGate).toBe(1)
      return session.submit(2, stepTo(near.x, near.y - stepMm))
    }
    expect(BOUNDS.cuttingMm).toBeLessThan(BOUNDS.travellingMm)
    expect(rejectionsOf(run(BOUNDS.cuttingMm))).toEqual([])
    for (const past of [1, STEP_BOUND_TOLERANCE_MM]) {
      expect(run(BOUNDS.cuttingMm + past)).toContainEqual(
        expect.objectContaining({ type: 'CommandRejected', reason: 'invalid_pose' }),
      )
    }
  })

  it('rejects a drillStep whose facing is not 0 to 3 as invalid_pose', () => {
    for (const facing of [4, 7]) {
      const [answer] = sessionFacingDownAt().submit(1, stepTo(START.x, START.y, NO_DRIVE, facing))
      expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'invalid_pose' })
    }
  })

  it('refuses a drillStep with no facing field', () => {
    const payload = { x: START.x, y: START.y, drive: NO_DRIVE }
    const unfaced = { type: 'drillStep', payload } as unknown as CommandIntent
    const [answer] = sessionFacingDownAt().submit(1, unfaced)
    expect(answer).toMatchObject({ type: 'CommandRejected', reason: 'invalid_payload' })
  })

  // Ticket 506: a turn reaches the authority on the step, not up to 12 ticks later on a report.
  it("cuts along the step's facing, not the last report's", () => {
    const near = { x: START.x, y: (SURFACE_TY + 1) * 1000 + 400 }
    const cutFor50Ticks = (reported: Facing, stepped: Facing) => {
      const session = sessionReportedAt(near, reported)
      rideCut(session, near, { ...RIDE_DOWN_50, facing: stepped })
      return session
    }
    const fresh = cutFor50Ticks(FACING.down, FACING.down)
    const stale = cutFor50Ticks(FACING.left, FACING.down)
    expect(tilesDestroyed(fresh.events()).length).toBeGreaterThan(0)
    expect(stale.events()).toEqual(fresh.events())
    expect(stale.state().world).toEqual(fresh.state().world)
    const leftward = cutFor50Ticks(FACING.down, FACING.left)
    expect(leftward.state().world).not.toEqual(fresh.state().world)
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
    const session = strongSessionFacingDownAt()
    stepDown(session, CUT_STEP_MM, 50)
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
      const session = strongSessionFacingDownAt(above)
      stepDown(session, CUT_STEP_MM, 60, above)
      return session
    })
  }

  it('refuses a gated cell inside the capsule at the cutting bound and stops the sweep before it', () => {
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
  /** The swept stamp's front leads a report's by the cutting bound (tickets 333, 334). */
  const REACH_GAIN_MM = SWEPT_AHEAD_MM - DRILL_STAMP_AHEAD_MM

  /**
   * The same scripted descent of the stamp cut by 5 Hz reports alone, or by a step every tick
   * beside them, each step's body held back by the swept stamp's longer reach.
   */
  function descend(isStepped: boolean, mmPerTick: number) {
    const session = sessionFacingDownAt(top)
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down, { drillTicks: 12 })
    for (let tick = 1; tick <= (METRES * 1000) / mmPerTick; tick++) {
      const y = top.y - mmPerTick * tick
      if (isStepped) session.submit(tick, stepTo(top.x, y + REACH_GAIN_MM))
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

  // At 40 mm a tick the level-0 cut falls behind the motion: it pays each cell its full #7 time
  // (ticket 399), where a report's carve yields a cell once half of it is worn away.
  it.each([10])('opens the same cells per metre at %i mm a tick', (mmPerTick) => {
    const reported = descend(false, mmPerTick)
    const stepped = descend(true, mmPerTick)
    expect(reported.opened.length).toBeGreaterThanOrEqual(METRES)
    expect(stepped.opened).toEqual(reported.opened)
  })

  it.each([10])('spends the same energy per cell, within 5%, at %i mm a tick', (mmPerTick) => {
    const reported = descend(false, mmPerTick)
    const stepped = descend(true, mmPerTick)
    const perCell = (run: typeof reported) => run.drillTicks / run.opened.length
    expect(Math.abs(perCell(stepped) / perCell(reported) - 1)).toBeLessThanOrEqual(0.05)
  })

  it('opens no cell farther from the swept path than the stamp reaches', () => {
    const { opened } = descend(true, 10)
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

describe('drill step per-cell budget (tickets 330, 335)', () => {
  const [gated] = surfaceOreTiles(1)
  const above = { x: gated.tx * 1000 + 500, y: (gated.ty + 4) * 1000 + 500 }
  /** Late enough that the body, riding its cut, is held at the gated cell for many ticks. */
  const OPENS_AT_TICK = 60
  const TICKS = 70

  /** A gate that holds every ore cell until `OPENS_AT_TICK`. */
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

  /**
   * The cursor after each step from the tick before the gate opens, the body riding its cut down
   * (ticket 570: since the cut rides the body's face, the body waits at the gate with it).
   */
  function cutThroughTheGate() {
    return withRegistrations([lateGate], () => {
      const session = strongSessionFacingDownAt(above)
      const cursors: NonNullable<ReturnType<ScriptedSession['vehicle']>['sweptCut']>[] = []
      let body = above
      for (let tick = 1; tick <= TICKS; tick++) {
        session.submit(tick, stepTo(body.x, body.y))
        const cursor = session.vehicle().sweptCut
        if (tick >= OPENS_AT_TICK - 1 && cursor !== undefined) cursors.push(cursor)
        const pose = { ...(session.vehicle().pose as VehiclePose), ...body, facing: FACING.down }
        body = poseRidingFront(pose, cursor)
      }
      return { session, cursors }
    })
  }

  it('keeps the budget the terrain slice holds: 32 density cells a tick', () => {
    expect(DRILL_CELLS_PER_TICK).toBe(32)
  })

  // The work picks how far, the budget never does (ticket 399 amending 335): held at the gate, the
  // cut goes on through the gated cell from the tick it opens, at its work's pace.
  it('cuts on from the gate the tick it opens, as far as its work reaches', () => {
    const { session, cursors } = cutThroughTheGate()
    const gateTopMm = (gated.ty + 1) * 1000
    expect(cursors[0].yMm).toBeGreaterThanOrEqual(gateTopMm)
    expect(cursors[0].carrySubSteps).toBe(0)
    cursors.slice(1).forEach((cursor, index) => {
      expect(cursor.yMm).toBeLessThanOrEqual(cursors[index].yMm)
    })
    expect(cursors[cursors.length - 1].yMm).toBeLessThan(gateTopMm - 1_000)
    const world = session.state().world
    for (const tile of [gated, { tx: gated.tx, ty: gated.ty - 1 }]) {
      expect(cellDensitySum(world, PARAMS, tile)).toBeLessThan(
        cellDensitySum(EMPTY_WORLD, PARAMS, tile),
      )
    }
  })

  it('passes the rest of its share on from a tick whose stamp stays within it', () => {
    const { cursors } = cutThroughTheGate()
    const [, opening] = cursors
    expect(opening.cutSharePassed).toBeGreaterThan(0)
    expect(opening.cutSharePassed).toBeLessThan(DRILL_CELLS_PER_TICK)
  })
})
