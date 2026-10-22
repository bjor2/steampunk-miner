import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createScenePops, popCarvedCellsInModeB } from '../scene/materialPops'
import { sprayPresence } from '../scene/sprayPresence'
import { readAuthorityState } from '../store/authorityLink'
import { listenForCarvedCells } from '../store/carveCompleteBroadcast'
import { resetGameStore, useGameStore } from '../store/gameStore'
import { SPEED_RIGS } from '../systems/authority/lawSlabRigs'
import { stateDigest } from '../systems/authority/stateDigest'
import { buildIntent } from '../systems/input/buildIntent'
import type { MaterialPopMode } from '../systems/materialPop/materialPopMode'
import type { PopIntake } from '../systems/materialPop/popIntake'
import { createSprayPool } from '../systems/render/sprayPool'
import { faceReadOf, isPopIn, type FaceRead } from './cutFaceRead'
import { createRig } from './cutFollowFixtures'

// Option A beside option B on #570's probe row (ticket 617, G&V's "both modes" bars on #442): the
// same rig drills straight down on planet 1 through the live loop once with the session's material
// pop mode on A and once on B, B's pops taken into a spray pool as the scene takes them. Pops are
// client-only, so both rides must read alike: on every open-gate tick after #570's 6-tick settle the
// gap at the face is at most 0.10 m and no cell drops at once; L20 delivers its cells/s at a
// descent/cut ratio of at least 0.891 (GD on #570), the same in both modes; the body moves the
// same tick for tick and the authority ends on the same digest, so #514's authority cost per tick
// is A's in B too, and B's only added work, the pop intake on each carved batch, is printed. In B
// every pop starts 0 or 1 tick after its cell's carve-complete tick. Rows: drill purchase 1, purchase 20 and the 84 m/s rig, at
// 30 and 144 frames/s; 840 and 8400 m/s wait for a probe rig that reaches them.

const SETTLE_TICKS = 6
const MAX_GAP_M = 0.1
/** GD on #570 (amendment 3 and the confirmation): L20 descends at least 0.891 of its cut speed. */
const DESCENT_PER_CUT_MIN = 0.891
const HOLD_NEVER_FULL = 60
/** Grok Bot's probe on #570 held aim_down for 120 ticks. */
const LEG_TICKS = 120
/** L1 cuts 1.5 m/s: 15 s takes its column past the dirt into ore, so B has units to pop. */
const SLOW_LEG_TICKS = 900
const MIN_JUDGED_TICKS = 30
/** The carve hook's own allowance (G&V's B bar): a pop starts on the carve tick or the next. */
const POP_LAG_TICKS_MAX = 1

interface ProbeRow {
  name: string
  levels: Record<string, number>
  legTicks: number
}

const ROWS: readonly ProbeRow[] = [
  {
    name: 'L1',
    levels: { drill_power: 1, cargo_hold: HOLD_NEVER_FULL },
    legTicks: SLOW_LEG_TICKS,
  },
  { name: 'L20', levels: { drill_power: 20, cargo_hold: HOLD_NEVER_FULL }, legTicks: LEG_TICKS },
  { name: '84 m/s', levels: SPEED_RIGS['84 m/s'].levels, legTicks: LEG_TICKS },
]

const LEGS = ROWS.flatMap((row) => [30, 144].map((framesPerSecond) => ({ row, framesPerSecond })))

type Leg = (typeof LEGS)[number]

interface PopStart {
  key: string
  tick: number
}

interface Ride {
  judged: FaceRead[]
  /** The body's centre after every drilling tick, and the digest after the leg. */
  positions: string[]
  digest: string
  carvedTicks: Map<string, number>
  popStarts: PopStart[]
  startLagTicksMost: number
  /** Microseconds the pop intake took on each carved batch, the client's only added work. */
  batchMicros: number[]
}

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  const sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'pop-side-by-side', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const ridden = new Map<string, Ride>()

function rideOf(leg: Leg, mode: MaterialPopMode): Ride {
  const key = `${leg.row.name}/${leg.framesPerSecond}/${mode}`
  const known = ridden.get(key)
  if (known !== undefined) return known
  const ride = rideDown(leg, mode)
  ridden.set(key, ride)
  return ride
}

/** #570's probe: off the pad, settle, then aim down with the mode's pops listening. */
function rideDown({ row, framesPerSecond }: Leg, mode: MaterialPopMode): Ride {
  const rig = createRig(RAPIER, row.levels, framesPerSecond)
  useGameStore.getState().switchMaterialPopMode(mode, 'debugApi')
  rig.hold(buildIntent(['aim_left']), 50)
  rig.hold(buildIntent([]), 90)
  const carvedTicks = new Map<string, number>()
  const popStarts: PopStart[] = []
  const lagBefore = sprayPresence.pops.startLagTicksMost
  sprayPresence.pops.startLagTicksMost = 0
  const batchMicros: number[] = []
  const pops = createScenePops(createSprayPool())
  notePopStarts(pops.intake, popStarts)
  let batchStart = 0
  // Listeners run in the order they joined, so the two either side time the intake alone.
  const stops = [
    listenForCarvedCells((cells) => {
      cells.forEach((cell) => carvedTicks.set(keyOf(cell.tile), cell.tick))
      batchStart = performance.now()
    }),
    popCarvedCellsInModeB(pops),
    listenForCarvedCells(() => batchMicros.push((performance.now() - batchStart) * 1000)),
  ]
  const reads: FaceRead[] = []
  const positions: string[] = []
  rig.hold(buildIntent(['aim_down']), row.legTicks, (tick) => {
    reads.push(faceReadOf(tick, reads.at(-1) ?? null))
    positions.push(`${tick.position.x},${tick.position.y}`)
  })
  stops.forEach((stop) => stop())
  const startLagTicksMost = sprayPresence.pops.startLagTicksMost
  sprayPresence.pops.startLagTicksMost = lagBefore
  const digest = stateDigest(readAuthorityState())
  return {
    judged: judgedOf(reads),
    positions,
    digest,
    carvedTicks,
    popStarts,
    startLagTicksMost,
    batchMicros,
  }
}

/** Wraps the intake's sink so every pop that starts is seen with its cell and the tick it began. */
function notePopStarts(intake: PopIntake, starts: PopStart[]): void {
  const { startPop } = intake.sink
  intake.sink = {
    ...intake.sink,
    startPop: (find, serial) => {
      starts.push({ key: keyOf({ tx: find.tx, ty: find.ty }), tick: readAuthorityState().tick })
      return startPop(find, serial)
    },
  }
}

const keyOf = ({ tx, ty }: { tx: number; ty: number }) => `${tx},${ty}`

/** #570's judged ticks: open-gate ticks past the settle, a cave face left out and settled after. */
function judgedOf(reads: readonly FaceRead[]): FaceRead[] {
  let openTicks = 0
  return reads.filter((read) => {
    openTicks = read.tick.authorityGate === 1 && !read.isFacingCave ? openTicks + 1 : 0
    return openTicks > SETTLE_TICKS
  })
}

/** Cells/s the body delivered along its facing over the judged ticks, and that over the cut's. */
function deliveredOf(judged: readonly FaceRead[]): { cellsPerSecond: number; perCut: number } {
  const delivered = meanOf(judged.map((read) => read.tick.speed))
  const cut = meanOf(judged.map((read) => read.tick.read?.cutSpeed ?? 0))
  return { cellsPerSecond: delivered, perCut: delivered / cut }
}

function meanOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Each started pop's lag after its cell's carve-complete tick; null where no carve was heard. */
function popLagsOf(ride: Ride): (number | null)[] {
  return ride.popStarts.map((start) => {
    const carved = ride.carvedTicks.get(start.key)
    return carved === undefined ? null : start.tick - carved
  })
}

function percentileOf(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
}

const MODES: readonly MaterialPopMode[] = ['A', 'B']
const MODE_LEGS = LEGS.flatMap((leg) => MODES.map((mode) => ({ ...leg, mode })))
const ROW = '$row.name at $framesPerSecond frames/s'
const MODE_ROW = `mode $mode, ${ROW}`

describe('material pop A beside B on the cut-face probe (ticket 617)', () => {
  it.each(MODE_LEGS)(`keeps the face within 0.10 m of the ground, ${MODE_ROW}`, (leg) => {
    const { judged } = rideOf(leg, leg.mode)
    expect(judged.length).toBeGreaterThanOrEqual(MIN_JUDGED_TICKS)
    expect(Math.max(...judged.map((read) => read.gapM))).toBeLessThanOrEqual(MAX_GAP_M)
  })

  it.each(MODE_LEGS)(`drops no whole cell at once, ${MODE_ROW}`, (leg) => {
    const pops = rideOf(leg, leg.mode).judged.flatMap((read) =>
      read.drops.filter((drop) => isPopIn(drop, read)),
    )
    expect(pops).toEqual([])
  })

  it.each(LEGS.filter((leg) => leg.row.name === 'L20'))(
    `descends at least 0.891 of its cut speed in both modes, delivering the same cells/s, ${ROW}`,
    (leg) => {
      const [a, b] = MODES.map((mode) => deliveredOf(rideOf(leg, mode).judged))
      console.info(
        `L20 at ${leg.framesPerSecond} frames/s: ${a.cellsPerSecond.toFixed(2)} cells/s, descent/cut ${a.perCut.toFixed(3)}`,
      )
      expect(a.perCut).toBeGreaterThanOrEqual(DESCENT_PER_CUT_MIN)
      expect(b).toEqual(a)
    },
  )

  it.each(LEGS)(`moves the body and the authority alike in A and B, ${ROW}`, (leg) => {
    const [a, b] = MODES.map((mode) => rideOf(leg, mode))
    expect(b.positions).toEqual(a.positions)
    expect(b.digest).toBe(a.digest)
  })

  it.each(LEGS)(`starts every B pop 0 or 1 tick after its cell is carved, ${ROW}`, (leg) => {
    const ride = rideOf(leg, 'B')
    expect(ride.popStarts.length).toBeGreaterThan(0)
    const lags = popLagsOf(ride)
    expect(lags.filter((lag) => lag === null || lag < 0 || lag > POP_LAG_TICKS_MAX)).toEqual([])
    expect(ride.startLagTicksMost).toBeLessThanOrEqual(POP_LAG_TICKS_MAX)
  })

  it.each(LEGS)(`starts no pop in mode A, ${ROW}`, (leg) => {
    expect(rideOf(leg, 'A').popStarts).toEqual([])
  })

  it.each(LEGS)(
    `logs the pop intake's cost on the same carved batches in A and B, ${ROW}`,
    (leg) => {
      const [a, b] = MODES.map((mode) => rideOf(leg, mode).batchMicros)
      expect(b.length).toBe(a.length)
      for (const [mode, micros] of [
        ['A', a],
        ['B', b],
      ] as const) {
        const p50 = percentileOf(micros, 0.5).toFixed(1)
        const p95 = percentileOf(micros, 0.95).toFixed(1)
        console.info(
          `${leg.row.name} at ${leg.framesPerSecond} frames/s, mode ${mode}: pop intake p50 ${p50} µs, p95 ${p95} µs over ${micros.length} batches`,
        )
      }
    },
  )

  it.todo('runs A beside B at 840 m/s once a probe rig reaches it on the live loop')
  it.todo('runs A beside B at 8400 m/s once a probe rig reaches it on the live loop')
})
