import { describe, expect, it } from 'vitest'
import { DRILL_STAMP_RADIUS_MM, DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { withRegistrations } from '../../registries/registrar'
import { minorsPerMajor } from '../economy/upgradeSteps'
import type { GateVerdict } from '../registries/gateChecks'
import { sweptDrillStampOf } from '../vehicle/drillStamp'
import { sweepPathOf, sweptStampOf } from '../vehicle/sweptCut'
import { FACING, type VehiclePose } from '../vehicle/vehiclePose'
import { groundReaderOf, type GroundReader } from '../world/groundReader'
import { ISO_DENSITY } from '../world/sampleGrid'
import type { StampPoint } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { vehicleOf } from './authorityState'
import { toCanonicalJson } from './canonicalJson'
import type { DomainEventBody } from './domainEvent'
import { PARAMS } from './scriptedSession'
import { drillAlongSweep } from './sweptDrill'
import {
  alongOf,
  bySweptCut,
  COLUMN_LEG,
  columnLeg,
  cutLeg,
  drillStepOfRig,
  eventsOfLeg,
  facingOfLeg,
  isRigInLaw,
  reachAlongOf,
  reachOf,
  rigAt,
  TILTED_LEG,
  type Leg,
  type LegCut,
  type LegRun,
} from './sweptRigFixtures'
import { drillAlongSpan } from './sweptSpanDrill'

// The swept carve clears a body-wide bore at any cells a tick (ticket 439, the TD shape on #397
// with the VS ruling): a fresh path whose bare disc at its reach would leave the body point
// uncovered cuts the capsule from the body instead. Before it, a rig past about a cell a tick left
// its own cell and the rim along its first tick standing, and its body rested on that lip at 0 m/s
// while the reach ran on. The fast rigs need the drill law past ticket 396's 4-tick floor, which
// #397 removes: until then their specs skip, and the rule's own specs run.

const BODY_WIDTH_MM = 900

describe('fresh swept stamp (ticket 439)', () => {
  const POSE: VehiclePose = {
    x: 20_500,
    y: 296_700,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: UP_VECTOR_SCALE,
    facing: FACING.down,
  }

  function freshStampAhead(aheadMm: number) {
    const stamp = sweptDrillStampOf(POSE, false, aheadMm)
    const path = sweepPathOf(undefined, POSE, { stamp, aheadMm }, 10)
    return { path, stamp, cut: sweptStampOf(path, stamp, path.steps) }
  }

  it('cuts the bare disc at its reach while that disc covers the body point', () => {
    const { stamp, cut } = freshStampAhead(800)
    expect(cut).toEqual({ ...stamp, tail: { xMm: stamp.xMm, yMm: stamp.yMm } })
  })

  it('keeps the bare disc with its reach exactly one stamp radius from the body point', () => {
    const { stamp, cut } = freshStampAhead(DRILL_STAMP_RADIUS_MM)
    expect(cut.tail).toEqual({ xMm: stamp.xMm, yMm: stamp.yMm })
  })

  it('cuts the capsule from the body point once its reach is past one stamp radius', () => {
    const { path, stamp, cut } = freshStampAhead(DRILL_STAMP_RADIUS_MM + 1)
    expect(path.from).toEqual({ xMm: POSE.x, yMm: POSE.y })
    expect(cut).toEqual({ ...stamp, tail: path.from })
  })

  it('switches to the capsule part way along a long fresh path, where the reach leaves the body', () => {
    const { path, stamp } = freshStampAhead(6_000)
    const near = sweptStampOf(path, stamp, 7)
    expect(near.tail).toEqual({ xMm: near.xMm, yMm: near.yMm })
    expect(sweptStampOf(path, stamp, 8).tail).toEqual(path.from)
  })
})

/** A station of a tick's cut: where along the leg it lies, how open it was when judged. */
interface Station {
  tick: number
  alongMm: number
  widthMm: number
}

const STATION_MM = 125
const SCAN_STEP_MM = 25
const SCAN_LIMIT_MM = 1_500

function isOpenAt(reader: GroundReader, point: StampPoint): boolean {
  return reader.densityAtPoint(point.xMm / MM_PER_METRE, point.yMm / MM_PER_METRE) < ISO_DENSITY
}

/** The open run from a station's centre one way across the facing, in scan steps. */
function openRunFrom(reader: GroundReader, centre: StampPoint, across: { x: number; y: number }) {
  let run = 0
  while (run < SCAN_LIMIT_MM) {
    const next = run + SCAN_STEP_MM
    const point = {
      xMm: centre.xMm + (across.x * next) / UP_VECTOR_SCALE,
      yMm: centre.yMm + (across.y * next) / UP_VECTOR_SCALE,
    }
    if (!isOpenAt(reader, point)) return run
    run = next
  }
  return run
}

/** The open run across the facing through a station: 0 when its centre still stands. */
function openWidthAt(reader: GroundReader, centre: StampPoint, leg: Leg): number {
  if (!isOpenAt(reader, centre)) return 0
  const facing = facingOfLeg(leg)
  const across = { x: -facing.y, y: facing.x }
  const back = { x: facing.y, y: -facing.x }
  return openRunFrom(reader, centre, across) + openRunFrom(reader, centre, back)
}

/** Points every `STATION_MM` from `from` toward `to`, `from` included. */
function stationsBetween(from: StampPoint, to: StampPoint): StampPoint[] {
  const dx = to.xMm - from.xMm
  const dy = to.yMm - from.yMm
  const length = Math.sqrt(dx * dx + dy * dy)
  return Array.from({ length: Math.ceil(length / STATION_MM) }, (_, index) => ({
    xMm: from.xMm + (dx * index * STATION_MM) / length,
    yMm: from.yMm + (dy * index * STATION_MM) / length,
  }))
}

/**
 * Every station from each tick's start (the body on the first, else the last tick's reach) to its
 * reach, judged on the first tick whose reach lies a stamp radius past it: the cut has then left
 * it for good. Stations no tick left that far are not judged.
 */
function judgedStationsOf(run: LegRun, leg: Leg): Station[] {
  const states = [run.start, ...run.ticks.map(({ state }) => state)]
  const reaches = states.map((state) => reachAlongOf(leg, state))
  return states.slice(1).flatMap((state, tick) => {
    const from = tick === 0 ? leg.start : reachOf(leg, states[tick])
    return stationsBetween(from, reachOf(leg, state)).flatMap((point) => {
      const alongMm = alongOf(leg, point)
      const judge = reaches.findIndex(
        (reach, at) => at > tick && reach >= alongMm + DRILL_STAMP_RADIUS_MM,
      )
      if (judge < 0) return []
      const reader = groundReaderOf(states[judge].world, PARAMS)
      return [{ tick, alongMm, widthMm: openWidthAt(reader, point, leg) }]
    })
  })
}

const isNarrow = ({ widthMm }: Station) => widthMm < BODY_WIDTH_MM

function rejectionsIn(run: LegRun): DomainEventBody[] {
  return eventsOfLeg(run).filter(({ type }) => type === 'CommandRejected')
}

const BORE_RIGS = [25, 44, 78, 300, 3600].map(rigAt)
const LEGS: readonly { name: string; leg: Leg }[] = [
  { name: 'down the column', leg: COLUMN_LEG },
  { name: 'down the tilted radius', leg: TILTED_LEG },
]
/** A 3 s leg, or to the core for the rigs that cross planet 1 sooner. */
const LEG_TICKS = 180

describe('body-wide bore at any cells a tick (ticket 439)', () => {
  for (const { name, leg } of LEGS) {
    for (const rig of BORE_RIGS) {
      it.skipIf(!isRigInLaw(rig))(
        `leaves the bore at least the body wide at every station, ${name} at ${rig.speed} m/s`,
        () => {
          const run = cutLeg({ rig, leg, maxTicks: LEG_TICKS })
          const stations = judgedStationsOf(run, leg)
          expect(rejectionsIn(run)).toEqual([])
          expect(stations.length).toBeGreaterThan(40)
          // The first tick's own stations, where a fresh path's bare disc left the start lip.
          expect(stations.filter(({ tick }) => tick === 0).length).toBeGreaterThan(0)
          expect(stations.filter(isNarrow)).toEqual([])
        },
      )
    }
  }
})

/** The path the cells and work per metre are counted over, from the leg's start. */
const WINDOW_MM = 30_000

interface WorkPerMetre {
  cellsPerMetre: number
  /** The opened cells' summed drill time over the sub-steps the walk spent. */
  workShare: number
}

function isInWindow(leg: Leg, { tx, ty }: TilePoint): boolean {
  const along = alongOf(leg, { xMm: tx * MM_PER_METRE + 500, yMm: ty * MM_PER_METRE + 500 })
  return along >= 0 && along < WINDOW_MM
}

/** Sub-steps the leg's ticks spent: a tick's work each, less what the last one carries on. */
function subStepsSpentBy(run: LegRun): number {
  const cursor = vehicleOf(run.ticks[run.ticks.length - 1].state, 'p1').sweptCut
  return run.ticks.length * DRILL_SUBSTEPS_PER_TICK - (cursor?.carrySubSteps ?? 0)
}

function workPerMetreOf(cut: LegCut): WorkPerMetre {
  const run = cutLeg({ ...cut, reachMm: WINDOW_MM + 2 * DRILL_STAMP_RADIUS_MM })
  const opened = eventsOfLeg(run).flatMap((event) =>
    event.type === 'TileDestroyed' && event.cause === undefined ? [event] : [],
  )
  const cursor = vehicleOf(run.ticks[run.ticks.length - 1].state, 'p1').sweptCut
  return {
    cellsPerMetre: opened.filter((tile) => isInWindow(cut.leg, tile)).length / (WINDOW_MM / 1000),
    workShare: (cursor?.digSubSteps ?? 0) / subStepsSpentBy(run),
  }
}

const BASE_RIG = rigAt(44)
const FASTER_RIGS = [78, 240, 300, 3600].map(rigAt)

describe('cells and work per metre at any speed (ticket 439, VS ruling)', () => {
  // The lower side of the VS gate: each extra cell pays its own drill time, energy and heat, so a
  // faster rig may open more a metre than the 44 m/s one, never fewer.
  it.skipIf(![BASE_RIG, ...FASTER_RIGS].every(isRigInLaw))(
    'opens at least the 44 m/s rig cells and work a metre at every faster rig: no free cells',
    () => {
      const base = workPerMetreOf({ rig: BASE_RIG, leg: COLUMN_LEG, maxTicks: 400 })
      const fewer = FASTER_RIGS.flatMap((rig) => {
        const faster = workPerMetreOf({ rig, leg: COLUMN_LEG, maxTicks: 400 })
        const cells = faster.cellsPerMetre / base.cellsPerMetre
        const work = faster.workShare / base.workShare
        return cells >= 1 && work >= 1 ? [] : [{ speed: rig.speed, cells, work }]
      })
      expect(fewer).toEqual([])
    },
  )

  // Measured with the fix on planet 1's column 30 and its tilted radius, no tile floor: 1.70 cells
  // a metre at 44 m/s, 2.00 from 240 m/s (1.18x; 1.14x at 78 m/s), the continuing ticks' full
  // tick of dwell on the rim. Asked on #439 before it is pinned.
  it.todo('opens at most 1.10x the 44 m/s rig cells and work a metre at every faster rig')

  it.todo(
    'opens byte-identical cells, ore, energy, heat and dig time a metre at 1x, 10x, 100x and 3600 m/s (exact rim dwell, #441)',
  )
})

/** A rig's pace down the column: metres its cut reached per sub-step of work it spent. */
function paceOf(cut: LegCut): number {
  const run = cutLeg({ ...cut, reachMm: WINDOW_MM })
  return reachAlongOf(cut.leg, run.ticks[run.ticks.length - 1].state) / subStepsSpentBy(run)
}

const RATIO_RIGS = [44, 240].map(rigAt)
/** Each drill major is 1.12x faster down to 10 sub-steps a cell (#397), +-5%. */
const MAJOR_RATIO = 1.12
const RATIO_TOLERANCE = 0.05

describe('felt speed per drill major with the fresh capsule (ticket 439, VS ruling)', () => {
  it.skipIf(!RATIO_RIGS.every(isRigInLaw))(
    'cuts each of the 44 and 240 m/s rigs 1.12x +-5% faster than the drill a major below it',
    () => {
      const misses = RATIO_RIGS.flatMap((rig) => {
        const drillStep = drillStepOfRig(rig) as number
        const cut = { rig, leg: COLUMN_LEG, maxTicks: 400 }
        const below = drillStep - minorsPerMajor()
        const ratio = paceOf({ ...cut, drillStep }) / paceOf({ ...cut, drillStep: below })
        return Math.abs(ratio / MAJOR_RATIO - 1) <= RATIO_TOLERANCE ? [] : [{ rig, ratio }]
      })
      expect(misses).toEqual([])
    },
  )

  // At the one-sub-step quantum the major below takes 2 sub-steps a cell, and either rig crosses
  // its 30 m in its first tick, as far as its stamp's lead: asked on #439 how this is judged.
  it.todo('cuts the 3600 m/s rig 1.12x +-5% faster than the drill a major below it')
})

const isListed = (tiles: readonly TilePoint[], { tx, ty }: TilePoint) =>
  tiles.some((tile) => tile.tx === tx && tile.ty === ty)

const REFUSED: GateVerdict = {
  outcome: 'refused',
  gateKind: 'probe',
  required: 'probe-rig',
  have: 'none',
}

/** A slice refusing the listed ore cells, as a rig gate does. */
function probeSliceOf(gated: readonly TilePoint[]): SliceDefinition {
  return {
    id: 'fresh-probe',
    register: (r) =>
      r.gateCheck({
        id: 'fresh-probe.listed-ore',
        check: ({ tile }) => (isListed(gated, tile) ? REFUSED : null),
      }),
  }
}

function isAt(event: DomainEventBody, { tx, ty }: TilePoint): boolean {
  return 'tx' in event && event.tx === tx && event.ty === ty
}

/** The ticks of a leg that report the cell refused. */
function ticksGatingAt(run: LegRun, tile: TilePoint): number[] {
  return run.ticks.flatMap(({ events }, tick) =>
    events.some((event) => event.type === 'DrillGated' && isAt(event, tile)) ? [tick] : [],
  )
}

function isCellDestroyed(run: LegRun, tile: TilePoint): boolean {
  return eventsOfLeg(run).some((event) => event.type === 'TileDestroyed' && isAt(event, tile))
}

/** The first tick whose reach comes within a stamp radius of a cell's near edge, along the leg. */
function firstTickNear(run: LegRun, leg: Leg, tile: TilePoint): number {
  const nearEdge = alongOf(leg, { xMm: tile.tx * MM_PER_METRE, yMm: (tile.ty + 1) * MM_PER_METRE })
  return run.ticks.findIndex(
    ({ state }) => reachAlongOf(leg, state) + DRILL_STAMP_RADIUS_MM > nearEdge,
  )
}

/** Planet 1's column 33, with ore beside its centre line in column 32, 4 and 18 m down. */
const RIM_LEG = columnLeg(33)
const RIM_GATES: readonly TilePoint[] = [
  { tx: 32, ty: 291 },
  { tx: 32, ty: 277 },
]
/** Planet 1's column 32, with an ore cell on its centre line 4 m down. */
const STOP_LEG = columnLeg(32)
const STOP_GATE: TilePoint = { tx: 32, ty: 291 }

const GATE_RIGS = [78, 300, 3600].map(rigAt)

describe('gates on the capsule cells at any speed (ticket 439, Horizontal Scaler)', () => {
  for (const rig of GATE_RIGS) {
    it.skipIf(!isRigInLaw(rig))(
      `reports a refused rim cell once, on the tick the capsule meets it, at ${rig.speed} m/s`,
      () => {
        const run = withRegistrations([probeSliceOf(RIM_GATES)], () =>
          cutLeg({ rig, leg: RIM_LEG, maxTicks: LEG_TICKS, reachMm: 24_000 }),
        )
        for (const gate of RIM_GATES) {
          expect(ticksGatingAt(run, gate)).toEqual([firstTickNear(run, RIM_LEG, gate)])
          expect(isCellDestroyed(run, gate)).toBe(false)
        }
      },
    )

    it.skipIf(!isRigInLaw(rig))(
      `stops before a refused centre cell, banking no work past it, at ${rig.speed} m/s`,
      () => {
        const run = withRegistrations([probeSliceOf([STOP_GATE])], () =>
          cutLeg({ rig, leg: STOP_LEG, maxTicks: 12 }),
        )
        const gating = ticksGatingAt(run, STOP_GATE)
        expect(gating.length).toBe(1)
        const after = run.ticks.slice(gating[0]).map(({ state }) => vehicleOf(state, 'p1').sweptCut)
        const gateTopMm = (STOP_GATE.ty + 1) * MM_PER_METRE
        expect(after.every((cursor) => cursor?.carrySubSteps === 0)).toBe(true)
        expect(after.every((cursor) => (cursor?.yMm ?? 0) >= gateTopMm)).toBe(true)
        expect(isCellDestroyed(run, STOP_GATE)).toBe(false)
      },
    )
  }
})

/** Each tick of a leg as canonical JSON, state and events. */
function canonicalTicksOf(run: LegRun): string[] {
  return run.ticks.map(({ state, events }) => toCanonicalJson({ state, events }))
}

const SPAN_RIGS = [300, 3600].map(rigAt)

describe('swept span against the per-cell carve on a fresh path (ticket 439)', () => {
  for (const { name, leg } of LEGS) {
    for (const rig of SPAN_RIGS) {
      it.skipIf(!isRigInLaw(rig))(
        `cuts the same bytes from the first tick, ${name} at ${rig.speed} m/s`,
        () => {
          const legCut = { rig, leg, maxTicks: 4 }
          const [perCell, span] = withRegistrations([], () => [
            cutLeg({ ...legCut, tick: bySweptCut(drillAlongSweep) }),
            cutLeg({ ...legCut, tick: bySweptCut((...cut) => drillAlongSpan(...cut).effect) }),
          ])
          expect(perCell.ticks.length).toBeGreaterThan(0)
          expect(canonicalTicksOf(span)).toEqual(canonicalTicksOf(perCell))
        },
      )
    }
  }
})
