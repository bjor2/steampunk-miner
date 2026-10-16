import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEV_FLAGS, type DevFlags } from '../constants/devFlags'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState } from '../store/authorityLink'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { buildIntent } from '../systems/input/buildIntent'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { cellDensitySum } from '../systems/world/cellYield'
import { SAMPLES_PER_CELL, SOLID_DENSITY } from '../systems/world/sampleGrid'
import { isTileYielded, type WorldState } from '../systems/world/worldState'
import { createRig, type Rig, type TickRead } from './cutFollowFixtures'

// The dig-speed STOP of #514 (Done-when 3, the TD's 6224603228 as amended by 6224615876, the
// Vertical Scaler's bars): with a pose report every tick while the drill bites, no cell may clear
// in fewer ticks than the swept law-exact path gives it, at the same rig and ground, down and
// level. The rig of `sweptCutPace.test.ts` cuts band 1 of planet 1 in 23 ticks a cell; each path
// leaves the pad, plays a 14 s leg down and then one level west, and the last 10 s of each are read:
// - dig ticks a cell: from the tick a fully solid cell first lost density to the tick it yielded,
//   for cells that did both inside the read window (a part-cut or cave-rim cell needs less work);
// - work per metre: drilled ticks (the ticks energy and heat are charged on, `groundDrill.ts`) a
//   metre along the leg;
// - cells per metre: cells yielded a metre.
// Paths: the swept cut (the reference), flag off at the shipped every-tick cadence, and flag off at
// 12 ticks (#514's kill-switch off). Asserted: no solid cell under the law's 23 ticks at a report
// every tick, and cells a metre within 5% of the swept path. Logged, the STOP readings sent back to
// the TD and the VS on #514 (the build stopped on them; their measure is this lane's reading of the
// bars until the TD confirms it): dig ticks a cell against the swept path (bar: median within 1%)
// and work a metre against it (bar: at least 1.000, no free work). Loop speed against the swept
// path and against 60/23 is logged, not gated. A lane: it runs only when named, prints the table
// and writes balance-report/dig-speed-stop.ndjson.

const RIG_LEVELS = { drill_tip: 600, engine: 5000, drill_power: 50 }
const LAW_TICKS_PER_CELL = 23
const LEG_SECONDS = 14
const READ_FROM_SECONDS = 4
const FRAMES_PER_SECOND = 60
/** Cells this far round the body, each way, are watched for density each tick. */
const WATCH_CELLS = 3
const SOLID_CELL_SUM = SAMPLES_PER_CELL * SOLID_DENSITY
const CELLS_PER_METRE_SHARE = 0.05
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const LEG_TIMEOUT_MS = 600_000

const PATHS: Readonly<Record<string, DevFlags>> = {
  swept: { ...DEV_FLAGS, 'drill.sweptCut': true },
  'every tick': { 'drill.sweptCut': false, 'drill.reportEveryTick': true },
  'every 12': { 'drill.sweptCut': false, 'drill.reportEveryTick': false },
}

type Section = 'down' | 'level'

/** One read window of one leg. */
interface LegReading {
  path: string
  section: Section
  metresPerSecond: number
  cellsPerSecond: number
  workPerMetre: number
  cellsPerMetre: number
  digTicksMedian: number
  digTicksMin: number
  cellsTimed: number
}

/** A watched cell: the tick it first lost density, and the tick it yielded. */
interface CellDig {
  firstBiteTick: number
  yieldTick: number | null
}

const ticksOf = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)
const readings: LegReading[] = []

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

afterAll(() => {
  console.log(formatTable(readings))
  writeReadings(readings)
})

/** A fresh rig on `path` leaves the pad, then plays and reads a leg down and a leg level. */
function playPath(path: string): LegReading[] {
  const rig = createRig(RAPIER, RIG_LEVELS, FRAMES_PER_SECOND, PATHS[path])
  rig.hold(buildIntent(['aim_left']), ticksOf(2))
  return [
    playLeg(rig, path, 'down', buildIntent(['aim_down'])),
    playLeg(rig, path, 'level', buildIntent(['aim_left'])),
  ]
}

/** Holds `intent` for a leg, reading the last half one tick at a time. */
function playLeg(rig: Rig, path: string, section: Section, intent: VehicleIntent): LegReading {
  rig.hold(intent, ticksOf(READ_FROM_SECONDS))
  const window = createReadWindow()
  for (let tick = 0; tick < ticksOf(LEG_SECONDS - READ_FROM_SECONDS); tick++) {
    window.note(rig.hold(intent, 1)[0])
  }
  return window.readingOf(path, section)
}

function createReadWindow() {
  const digs = new Map<string, CellDig>()
  const positions: Vector2[] = []
  let drilledTicks = 0
  let yielded = 0
  let world = readAuthorityState().world
  const note = (read: TickRead) => {
    const after = readAuthorityState().world
    const tick = readAuthorityState().tick
    yielded += noteCellDigs(digs, world, after, read.position, tick)
    drilledTicks += read.result.flags.isDrilling ? 1 : 0
    positions.push(read.position)
    world = after
  }
  const readingOf = (path: string, section: Section): LegReading => {
    const metres = pathLengthOf(positions)
    const seconds = positions.length * PHYSICS_TIMESTEP
    const digTicks = timedDigTicksOf(digs)
    return {
      path,
      section,
      metresPerSecond: thousandthsOf(metres / seconds),
      cellsPerSecond: thousandthsOf(yielded / seconds),
      workPerMetre: thousandthsOf(drilledTicks / metres),
      cellsPerMetre: thousandthsOf(yielded / metres),
      digTicksMedian: medianOf(digTicks),
      digTicksMin: Math.min(...digTicks),
      cellsTimed: digTicks.length,
    }
  }
  return { note, readingOf }
}

/** Notes each watched cell's first bite and yield this tick; returns the cells it yielded. */
function noteCellDigs(
  digs: Map<string, CellDig>,
  before: WorldState,
  after: WorldState,
  at: Vector2,
  tick: number,
): number {
  const params = planetParamsOf(readAuthorityState().planet)
  if (params === null) return 0
  let yielded = 0
  for (let dy = -WATCH_CELLS; dy <= WATCH_CELLS; dy++) {
    for (let dx = -WATCH_CELLS; dx <= WATCH_CELLS; dx++) {
      const tile = { tx: Math.floor(at.x) + dx, ty: Math.floor(at.y) + dy }
      const key = `${tile.tx},${tile.ty}`
      const was = cellDensitySum(before, params, tile)
      const isFirstBite = was === SOLID_CELL_SUM && cellDensitySum(after, params, tile) < was
      if (isFirstBite && !digs.has(key)) digs.set(key, { firstBiteTick: tick, yieldTick: null })
      const isYieldedNow = !isTileYielded(before, tile) && isTileYielded(after, tile)
      const dig = digs.get(key)
      if (isYieldedNow && dig !== undefined) dig.yieldTick = tick
      if (isYieldedNow) yielded++
    }
  }
  return yielded
}

/** Ticks from first bite to yield, both inside the window, the yielding tick counted. */
function timedDigTicksOf(digs: ReadonlyMap<string, CellDig>): number[] {
  const timed = [...digs.values()].filter((dig) => dig.yieldTick !== null)
  return timed.map((dig) => (dig.yieldTick as number) - dig.firstBiteTick + 1)
}

function pathLengthOf(positions: readonly Vector2[]): number {
  let metres = 0
  for (let i = 1; i < positions.length; i++) {
    metres += Math.hypot(positions[i].x - positions[i - 1].x, positions[i].y - positions[i - 1].y)
  }
  return metres
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function thousandthsOf(value: number): number {
  return Math.round(value * 1000) / 1000
}

function formatTable(rows: readonly LegReading[]): string {
  const header =
    'path | section | m/s | cells/s | drilled ticks/m | cells/m | dig ticks median | min | cells timed'
  const lines = rows.map((row) =>
    [
      row.path,
      row.section,
      row.metresPerSecond,
      row.cellsPerSecond,
      row.workPerMetre,
      row.cellsPerMetre,
      row.digTicksMedian,
      row.digTicksMin,
      row.cellsTimed,
    ].join(' | '),
  )
  return [header, `60/23 = ${thousandthsOf(60 / LAW_TICKS_PER_CELL)} cells/s`, ...lines].join('\n')
}

function writeReadings(rows: readonly LegReading[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = rows.map((row) => JSON.stringify({ ticket: 514, ...row }))
  writeFileSync(new URL('dig-speed-stop.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

function readingOf(path: string, section: Section): LegReading {
  const found = readings.find((row) => row.path === path && row.section === section)
  if (found === undefined) throw new Error(`no ${path} ${section} leg was played`)
  return found
}

describe('dig speed at a report every tick against the swept law-exact path (#514 STOP)', () => {
  it(
    'plays the swept cut and both flag-off cadences down and level',
    () => {
      for (const path of Object.keys(PATHS)) readings.push(...playPath(path))
      expect(readings).toHaveLength(6)
    },
    LEG_TIMEOUT_MS,
  )

  for (const section of ['down', 'level'] as const) {
    it(`clears no solid cell ${section} in fewer ticks than the law at a report every tick`, () => {
      expect(readingOf('every tick', section).digTicksMin).toBeGreaterThanOrEqual(
        LAW_TICKS_PER_CELL,
      )
    })

    it(`cuts the swept path's cells a metre ${section}, within 5%`, () => {
      const swept = readingOf('swept', section)
      const drift = Math.abs(readingOf('every tick', section).cellsPerMetre - swept.cellsPerMetre)
      expect(drift).toBeLessThanOrEqual(swept.cellsPerMetre * CELLS_PER_METRE_SHARE)
    })

    it(`logs dig ticks a cell and work a metre ${section} against the swept path`, () => {
      const swept = readingOf('swept', section)
      const everyTick = readingOf('every tick', section)
      const ratios = {
        digTicksMedian: thousandthsOf(everyTick.digTicksMedian / swept.digTicksMedian),
        workPerMetre: thousandthsOf(everyTick.workPerMetre / swept.workPerMetre),
        speed: thousandthsOf(everyTick.metresPerSecond / swept.metresPerSecond),
      }
      console.log(`every tick / swept, ${section}: ${JSON.stringify(ratios)}`)
      expect(ratios.workPerMetre).toBeGreaterThan(0)
    })
  }
})
