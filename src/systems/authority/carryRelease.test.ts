import { describe, expect, it } from 'vitest'
import { DRILL_STAMP_OFFSET_MM, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { GateOutcome } from '../registries/gateChecks'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { UP_VECTOR_SCALE } from '../../constants/physics'
import type { SweptCut } from '../vehicle/sweptCut'
import {
  FACING,
  facingVectorOf,
  noseTileOf,
  type Facing,
  type VehiclePose,
} from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import { EMPTY_WORLD, materialCellAt } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { heldCarryCellOf } from './carryRelease'
import type { RuleEffect } from './commandRule'
import { openDrillGates } from './drillGates'
import { drillSubStepsOfCells } from './groundDrill'
import { heatThrottledDrill } from './heatRules'
import { shockTicksFor } from './magnetic/electrifiedShock'
import {
  coreTiles,
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  surfaceOreTiles,
} from './scriptedSession'
import { stepBoundsAt } from './stepBoundRead'
import { leavingCellToCarry, ungatedPriceOf } from './sweptCarry'
import { drillSweepBy, IN_ROWS, type SweptCarve } from './sweptDrill'

// The carry's cell joins the stamp once it lies in the body's next step (ticket 421, GD ruling on
// #421 Q2): the slab from the body's face to the face plus the cutting bound, across its width,
// widened by `CARRY_RELEASE_MARGIN_SAMPLES` ahead and to the sides. A released cell is still
// gate-checked as the stamp meets it, its yield lands where the sweep crosses it, and the carry
// banked against it is clamped to what the stamp left of it, so no work is counted twice.

const Q = DRILL_SUBSTEPS_PER_TICK

/** Facing +x at (300, 500) mm: its face at x 750, its next-step slab's far edge at x 2000. */
const POSE: VehiclePose = { x: 300, y: 500, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.right }
const CUTTING_MM = 500

describe('the carry holds its cell out of the stamp (ticket 421)', () => {
  it('releases a cell once one of its samples lies in the body’s next-step slab', () => {
    expect(heldCarryCellOf({ tx: 1, ty: 0 }, POSE, CUTTING_MM)).toBeNull()
    expect(heldCarryCellOf({ tx: 2, ty: 0 }, POSE, CUTTING_MM)).toBeNull()
    expect(heldCarryCellOf({ tx: 1, ty: 1 }, POSE, CUTTING_MM)).toBeNull()
  })

  it('holds a cell past the slab’s far edge, beside it or behind the body’s face', () => {
    expect(heldCarryCellOf({ tx: 2, ty: 0 }, { ...POSE, x: 299 }, CUTTING_MM)).toEqual({
      tx: 2,
      ty: 0,
    })
    expect(heldCarryCellOf({ tx: 3, ty: 0 }, POSE, CUTTING_MM)).toEqual({ tx: 3, ty: 0 })
    expect(heldCarryCellOf({ tx: 1, ty: 2 }, POSE, CUTTING_MM)).toEqual({ tx: 1, ty: 2 })
    expect(heldCarryCellOf({ tx: -1, ty: 0 }, POSE, CUTTING_MM)).toEqual({ tx: -1, ty: 0 })
  })

  it('carries no cell when the walk carries nothing', () => {
    expect(heldCarryCellOf(null, POSE, CUTTING_MM)).toBeNull()
  })
})

/** A slice whose gate check answers `outcome` for every ore cell, as a rig or a charge gate does. */
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

/** A slice that makes every ore cell dense: a level-0 tip skids on it (tip-locked, #236). */
const DENSE_ORE: SliceDefinition = {
  id: 'gate-probe',
  register: (r) => r.oreDrillClass({ id: 'gate-probe.dense', drillClassOf: () => 'dense' }),
}

const GATED_KINDS: readonly [string, SliceDefinition][] = [
  ['rig-gated (refused)', gateSliceOf('refused')],
  ['charge-gated (blocked)', gateSliceOf('blocked')],
  ['tip-locked', DENSE_ORE],
]
/** The kinds a gate reports in `DrillGated`: a tip lock is the drill law's, never reported. */
const REPORTED_KINDS = GATED_KINDS.slice(0, 2)

const [GATED] = surfaceOreTiles(1)
const BESIDE: TilePoint = { tx: GATED.tx, ty: GATED.ty - 1 }

/** The stamp's asks of the gated cell and its neighbour, its cell held out by the carry or not. */
function stampAsksWith(held: TilePoint | null) {
  const session = createScriptedSession()
  const state = session.state()
  const drill = heatThrottledDrill(PARAMS.planetIndex, vehicleOf(state, 'p1'))
  const cellTicks = drillSubStepsOfCells(PARAMS, drill, shockTicksFor(state, 'p1'))
  const gates = openDrillGates(state, 'p1', PARAMS, cellTicks)
  const window = { firstTick: 0, ticks: 1, subStepsPerTick: Q }
  const request = { world: EMPTY_WORLD, window, gates, energy: 100_000 }
  const asked = leavingCellToCarry(request, held).gates
  const answers = [BESIDE, GATED, BESIDE].map((tile) =>
    asked.drillTicksOf(tile, materialCellAt(EMPTY_WORLD, PARAMS, tile), 0),
  )
  return { answers, events: asked.refusedEvents() }
}

describe('a released cell is still gate-checked (ticket 421, Horizontal Scaler)', () => {
  it.each(GATED_KINDS)(
    'answers the stamp for a %s cell exactly as when it was held: not carved, reported in order',
    (_, slice) => {
      const { held, released } = withRegistrations([slice], () => ({
        held: stampAsksWith(GATED),
        released: stampAsksWith(null),
      }))
      expect(released).toEqual(held)
      expect(released.answers[1]).toBeNull()
    },
  )

  it('carves a plain cell once released, which the carry alone cut while it was held', () => {
    const held = stampAsksWith(BESIDE)
    const released = stampAsksWith(null)
    expect(held.answers[0]).toBeNull()
    expect(released.answers[0]).toBeGreaterThan(0)
  })
})

/** #397's 15 m/s rig on planet 1 (16.5 m/s at purchase 12 since #552), a hold that never fills and a deep tank. */
const RIG_15 = { drill_power: 12, drill_tip: 600, engine: 17, cargo_hold: 51 }
const COLUMN = 30

const DEEP_START = {
  x: COLUMN * 1000 + 500,
  y: (surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles) - 40) * 1000 + 500,
}

/** A leg's facing, and whether its ground is first softened to just over its yield. */
interface LegShape {
  facing: Facing
  isSoftened: boolean
  /** Where the body starts, in mm; 40 tiles under column 30's surface when absent. */
  start?: { x: number; y: number }
  /** The rig's upgrade levels; `RIG_15` when absent. */
  levels?: Record<string, number>
}

/** What the softening carve takes off each sample within its radius, as the span fixtures do. */
const SOFTENED_BY = 125
const SOFTENED_RADIUS_MM = 16_000

/** The rig at the leg's start, facing along it. */
function rigFor(shape: LegShape): AuthorityState {
  const { facing, isSoftened, start = DEEP_START, levels = RIG_15 } = shape
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  for (const [upgradeId, level] of Object.entries(levels)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '100000000' } })
  const pose = { ...POSE, ...start, facing }
  if (isSoftened) session.submit(0, softeningAhead(pose))
  session.submit(0, { type: 'reportPose', payload: { ...pose, ...REPORT_COUNTS } })
  return session.state()
}

/** Softens the ground round a point 8 m ahead of the pose, so the stamp breaks rim cells too. */
function softeningAhead(pose: VehiclePose) {
  const { x, y } = pointAheadOf(pose, 8_000)
  const payload = { x, y, radius: SOFTENED_RADIUS_MM, amount: SOFTENED_BY }
  return { type: 'debug.carveCircle', payload } as const
}

/** The point `mm` ahead of `point` along the pose's facing (each facing is axis-aligned here). */
function pointAheadOf(pose: VehiclePose, mm: number, point = { x: pose.x, y: pose.y }) {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return {
    x: point.x + (facing.x * mm) / UP_VECTOR_SCALE,
    y: point.y + (facing.y * mm) / UP_VECTOR_SCALE,
  }
}

const REPORT_COUNTS = {
  driving: false,
  thrusting: false,
  drilling: false,
  thrustTicks: 0,
  driveTicks: 0,
  drillTicks: 0,
  drive: NO_DRIVE,
}

/** One tick of a leg: the state before, the pose it cut from, its carve and its effect. */
interface LegTick {
  before: AuthorityState
  pose: VehiclePose
  carved: SweptCarve
  effect: RuleEffect
}

/**
 * A leg whose body follows the cut as a live one does: each tick's pose sits where the last tick's
 * cut reached, pulled back by the stamp's lead, so its next step runs into the face.
 */
function followCut(shape: LegShape, ticks: number): LegTick[] {
  let state = rigFor(shape)
  const start = vehicleOf(state, 'p1').pose as VehiclePose
  const leg: LegTick[] = []
  for (let tick = 1; tick <= ticks; tick++) {
    const pose = { ...start, ...poseBehindCut(start, vehicleOf(state, 'p1').sweptCut) }
    const before = { ...state, tick: state.tick + 1 }
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    const swept = drillSweepBy(before, PARAMS, 'p1', { target: noseTileOf(pose), step }, IN_ROWS)
    if (swept.carved === null) throw new Error('the rig cut nothing')
    leg.push({ before, pose, carved: swept.carved, effect: swept.effect })
    state = swept.effect.state
  }
  return leg
}

/** Where the body stands behind the cut's reach: the start before the first tick. */
function poseBehindCut(start: VehiclePose, cursor: SweptCut | undefined) {
  if (cursor === undefined) return { x: start.x, y: start.y }
  return pointAheadOf(start, -DRILL_STAMP_OFFSET_MM, { x: cursor.xMm, y: cursor.yMm })
}

/** A level leg west through plain ground: the lip's case. */
const LEG = followCut({ facing: FACING.left, isSoftened: false }, 160)

function isReleasedOn({ before, pose, carved }: LegTick): boolean {
  const cuttingMm = stepBoundsAt(before, 'p1').cuttingMm
  return (
    carved.carryTarget !== null && heldCarryCellOf(carved.carryTarget, pose, cuttingMm) === null
  )
}

/** What is left of `tile` in the tick's world, at the drill's own time. */
function leftOf(state: AuthorityState, tile: TilePoint): number {
  return ungatedPriceOf(state, PARAMS, 'p1', { tile, world: state.world })
}

/** The tick's paid cells with what each was paid and what was left of it as the tick began. */
function paidCellsOf({ before, carved }: LegTick) {
  return carved.paid.map((tile, at) => ({
    price: carved.paidPrices[at],
    left: leftOf(before, tile),
  }))
}

/** A cell paid what the stamp's bite left of it, under what was left as the tick began. */
const isPaidOnRelease = ({ price, left }: { price: number; left: number }) => price < left

/** The tick's walk paid a cell the stamp bit, on the tick it met it (rule (b)). */
const hasReleasePay = (tick: LegTick) => paidCellsOf(tick).some(isPaidOnRelease)

/**
 * An up leg through plain ground: the lifting stamp held the cell ahead out until the body's front
 * met it (#432's stall, measured at a phase of 0.414 of a cell); the release pays it the same way.
 */
const UP_LEG = followCut({ facing: FACING.up, isSoftened: false }, 120)

const PAID_LEGS: readonly [string, LegTick[]][] = [
  ['level', LEG],
  ['up (ticket 432)', UP_LEG],
]

describe('a released cell is paid, not free (tickets 421, 432)', () => {
  it.each(PAID_LEGS)(
    '%s leg: pays the cell the stamp bit on the tick the walk meets it, the body following',
    (_, leg) => {
      expect(leg.filter(hasReleasePay).length).toBeGreaterThan(10)
    },
  )

  it.each(PAID_LEGS)(
    '%s leg: never carries more than is left of the cell it works toward',
    (_, leg) => {
      const over = leg.filter(({ carved, effect }) => {
        const left = carved.carryTarget === null ? 0 : leftOf(effect.state, carved.carryTarget)
        return carved.carrySubSteps > left
      })
      expect(over).toEqual([])
    },
  )

  it.each(PAID_LEGS)(
    '%s leg: pays each cell exactly what was left of it, and no tick more than its carry and work',
    (_, leg) => {
      let paidOverLeg = 0
      for (const tick of leg) {
        const cells = paidCellsOf(tick)
        const unbitten = cells.filter((cell) => !isPaidOnRelease(cell))
        expect(unbitten.map(({ price }) => price)).toEqual(unbitten.map(({ left }) => left))
        const paid = cells.reduce((sum, { price }) => sum + price, 0)
        const available = Q + (vehicleOf(tick.before, 'p1').sweptCut?.carrySubSteps ?? 0)
        expect(paid + tick.carved.carrySubSteps).toBeLessThanOrEqual(available)
        paidOverLeg += paid
      }
      expect(paidOverLeg).toBeGreaterThan(20 * Q)
    },
  )

  // Since ticket 570 a cutting tick's front bites into the cell its work cannot pay in full
  // (`sweptFront.ts`) instead of releasing it: the bite is paid what it removed and the rest of the
  // work carries toward the same cell, never more than is left of it, never toward another.
  it.each(PAID_LEGS)(
    '%s leg: carries what a bite left only toward the cell it bit, never banking it forward',
    (_, leg) => {
      const bitten = leg.filter(hasReleasePay)
      const forward = bitten.filter(({ carved }) => {
        const last = carved.paid[carved.paid.length - 1]
        return carved.carrySubSteps > 0 && !isSameTile(carved.carryTarget, last)
      })
      expect(bitten.length).toBeGreaterThan(0)
      expect(forward).toEqual([])
    },
  )
})

/** The tick's broken cells, in event order. */
function brokenCellsOf({ effect }: LegTick): string[] {
  return effect.events.flatMap((event) =>
    event.type === 'TileDestroyed' ? [`${event.tx},${event.ty}`] : [],
  )
}

/** The paid cells, then a released cell, as far as each broke this tick. */
function crossedBrokenOf(tick: LegTick): string[] {
  const broken = new Set(brokenCellsOf(tick))
  const { paid, carryTarget } = tick.carved
  const crossed = isReleasedOn(tick) && carryTarget !== null ? [...paid, carryTarget] : paid
  return crossed.map(({ tx, ty }) => `${tx},${ty}`).filter((key) => broken.has(key))
}

/**
 * A leg down through softened ground: the stamp breaks a released cell and its row's rim cells in
 * the same tick, where its rows would list a rim cell first.
 */
const SOFT_LEG = followCut({ facing: FACING.down, isSoftened: true }, 120)

describe('a released cell yields in walk order (ticket 421, extends ticket 399)', () => {
  it('yields the paid cells and then a released one first, in the order the sweep crosses them', () => {
    for (const tick of SOFT_LEG) {
      const crossed = crossedBrokenOf(tick)
      expect(brokenCellsOf(tick).slice(0, crossed.length)).toEqual(crossed)
    }
    const releasedAmongOthers = SOFT_LEG.filter(
      (tick) => isReleasedOn(tick) && brokenCellsOf(tick).length > crossedBrokenOf(tick).length,
    )
    expect(releasedAmongOthers.length).toBeGreaterThan(5)
  })
})

/** Four tiles above `tile`, at its column's middle. */
function startAbove(tile: TilePoint) {
  return { x: tile.tx * 1000 + 500, y: (tile.ty + 4) * 1000 + 500 }
}

/** A drill far past the old 4-tick floor on band 1 with no tip, so a dense ore cell locks it (#334's spec). */
const TIPLESS_RIG = { drill_power: 54 }

/** A leg down onto `tile` with `levels`, the body following the cut. */
function legDownOnto(tile: TilePoint, levels: Record<string, number>): LegTick[] {
  return followCut({ facing: FACING.down, isSoftened: false, start: startAbove(tile), levels }, 240)
}

function isSameTile(a: TilePoint | null, b: TilePoint): boolean {
  return a !== null && a.tx === b.tx && a.ty === b.ty
}

describe('a gated cell in the body’s next step stops the cut (ticket 421, Horizontal Scaler)', () => {
  it.each(GATED_KINDS)('never cuts a %s cell, nor banks or walks past it', (_, slice) => {
    const leg = withRegistrations([slice], () => legDownOnto(GATED, TIPLESS_RIG))
    const last = leg[leg.length - 1]
    const { world } = last.effect.state
    // The body ends standing with the gated cell in its next step, where a carried cell is released.
    expect(heldCarryCellOf(GATED, last.pose, stepBoundsAt(last.before, 'p1').cuttingMm)).toBeNull()
    const untouched = (tile: TilePoint) => cellDensitySum(EMPTY_WORLD, PARAMS, tile)
    expect(cellDensitySum(world, PARAMS, GATED)).toBe(untouched(GATED))
    expect(cellDensitySum(world, PARAMS, BESIDE)).toBe(untouched(BESIDE))
    const cursor = vehicleOf(leg[leg.length - 1].effect.state, 'p1').sweptCut
    expect(cursor?.yMm).toBeGreaterThanOrEqual((GATED.ty + 1) * 1000)
    expect(cursor?.carrySubSteps).toBe(0)
  })

  it.each(REPORTED_KINDS)(
    'banks no carry toward a %s cell from the tick the carve reports it, before the walk meets it',
    (_, slice) => {
      const leg = withRegistrations([slice], () => legDownOnto(GATED, RIG_15))
      const aimedAtReported = leg.filter(
        ({ carved, effect }) =>
          isSameTile(carved.carryTarget, GATED) &&
          effect.events.some((event) => event.type === 'DrillGated' && isAtTile(event, GATED)),
      )
      expect(aimedAtReported.length).toBeGreaterThan(0)
      expect(aimedAtReported.map(({ carved }) => carved.carrySubSteps)).toEqual(
        aimedAtReported.map(() => 0),
      )
    },
  )

  // Since ticket 570 the front opens the core cell as it bites through it, so the harvest lands as
  // the cell yields; the walk ends where its centre enters the cell, paying the rest.
  it('bites into the core cell, harvests it as it opens, and ends the walk at it with nothing carried', () => {
    const [top] = coreTiles(1)
    const leg = legDownOnto(top, RIG_15)
    const harvested = leg.findIndex(({ effect }) =>
      effect.events.some((event) => event.type === 'TileDestroyed' && isAtTile(event, top)),
    )
    const aimedAtCore = leg.filter((tick) => isSameTile(tick.carved.carryTarget, top))
    expect(aimedAtCore.length).toBeGreaterThan(0)
    expect(leg[harvested]?.effect.events.some(({ type }) => type === 'CoreTileHarvested')).toBe(
      true,
    )
    const entered = leg.findIndex(
      ({ carved }) =>
        carved.paid.some((tile) => isSameTile(tile, top)) && carved.carryTarget === null,
    )
    expect(entered).toBeGreaterThanOrEqual(0)
    expect(leg[entered].carved.carrySubSteps).toBe(0)
  })
})

function isAtTile(event: { tx?: number; ty?: number }, tile: TilePoint): boolean {
  return event.tx === tile.tx && event.ty === tile.ty
}
