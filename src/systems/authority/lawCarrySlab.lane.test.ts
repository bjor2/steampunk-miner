import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { onCurveSteps } from '../economy/vehicleStats'
import { LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  cutSlab,
  SLAB_PATHS,
  strideOfRig,
  strideOfSpeedMps,
  type SlabPath,
  type SlabRun,
  type SlabSection,
  type SlabTilt,
  type SlabTrack,
} from './lawCarrySlabFixtures'

// The reference rows of the report cut's charge on density removed (ticket 535, A6: the TD shape
// 6228682000 as VS 6228674086 and the GD 6228674068 ruled the reference, the TD's geometry
// amendment 6228838042 as VS 6228848270 confirmed it). Every row, 25, 44, 240 and 3600 m/s and
// the stored ladder with its 7 to 13 m/s rigs, is a pure authority replay of one prescribed pose
// list on planet 1's fixed seed (`lawCarrySlabFixtures.ts`): flat and tilted 30 degrees, level
// through band 1 and down from under the surface, the same poses fed to `drillStep` (swept, the
// reference) and to the report carve with the charge on and off at 12 ticks and every tick, no
// body, so nothing jams. Law work is read from the ground, energy from the tank, heat ticks as
// the report rule feeds the gauge. Gated (VS, hard): energy per unit of law work within 1% of
// swept at the same rig and ground, heat at least swept's less one cell; the regression gate:
// with the charge on or off at the same cadence the carve is byte-identical (the same chunks,
// cells in order and law work), and no `CommandRejected` on any path. Cross-checks: the charge
// against the analytic law value (the drill's quanta a tick per drill tick of law work, within
// 1%, red beyond), and, when the loop lane's `balance-report/exact-carry.ndjson` is present, the
// 25 and 44 m/s ratios against the real loop's within 1%. Logged, never gated here: law work per
// metre and cells per metre against swept (#514's geometry bars). A lane: it runs only when named,
// prints the table and writes balance-report/law-carry-slab.ndjson.

const RIG_SAFETY = { hull: 5000, cargo_hold: 5000 }
/** VS's rows (`physics/exactCarry.lane.test.ts`): rigs named by their band-1 cut speed. */
const SPEED_RIGS: Readonly<Record<string, { levels: Record<string, number>; speedMps: number }>> = {
  '25 m/s': {
    levels: { drill_power: 250, drill_tip: 600, engine: 5000, ...RIG_SAFETY },
    speedMps: 25,
  },
  '44 m/s': { levels: { drill_power: 300, drill_tip: 200, ...RIG_SAFETY }, speedMps: 44 },
  '240 m/s': { levels: { drill_power: 450, drill_tip: 600, ...RIG_SAFETY }, speedMps: 240 },
  '3600 m/s': { levels: { drill_power: 2000, drill_tip: 600, ...RIG_SAFETY }, speedMps: 3600 },
}
/** Systems' ladder, stored as the loop lane stores it; its pose list moves at the rig's law speed. */
const P200 = onCurveSteps(200)
const LADDER_RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0, ...RIG_SAFETY },
  'stored 10': { drill_power: 10, drill_tip: 0, ...RIG_SAFETY },
  'stored 20': { drill_power: 20, drill_tip: 0, ...RIG_SAFETY },
  'stored 50': { drill_power: 50, drill_tip: 0, ...RIG_SAFETY },
  'stored 100': { drill_power: 100, drill_tip: 0, ...RIG_SAFETY },
  'stored 200': { drill_power: P200.drill_power, drill_tip: P200.drill_tip, ...RIG_SAFETY },
}
const TILTS: readonly SlabTilt[] = ['flat', 'tilted']
const SECTIONS: readonly SlabSection[] = ['level', 'down']
const CHARGED_PATHS = ['exact @12', 'exact @1'] as const
const CADENCES = ['@12', '@1'] as const
const ENERGY_SHARE = 0.01
const LOOP_SHARE = 0.01
const ANALYTIC_SHARE = 0.01
/** Under this many quanta a run is quantized past the 1% bar (one quantum is 1%): logged only. */
const ANALYTIC_MIN_QUANTA = 100
/** The analytic law value: the drill's quanta a tick for a drill tick of law work. */
const QUANTA_PER_LAW_WORK = ENERGY_QUANTA_PER_TICK.drill / LAW_WORK_PER_DRILL_TICK
/** The loop lane's rows this lane validates itself against, by rig and section. */
const LOOP_REPORT = new URL('../../../balance-report/exact-carry.ndjson', import.meta.url)
const REPORT_FOLDER = new URL('../../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 600_000

interface SlabReading extends Omit<SlabRun, 'chunks' | 'broken' | 'refusals'> {
  rig: string
  tilt: SlabTilt
  section: SlabSection
  path: SlabPath
  strideMm: number
  cells: number
}

const runs = new Map<string, SlabRun>()
const readings: SlabReading[] = []

afterAll(() => {
  console.log(formatTable(readings))
  writeReadings(readings)
})

const keyOf = (rig: string, tilt: SlabTilt, section: SlabSection, path: SlabPath) =>
  `${rig} ${tilt} ${section} ${path}`

function playRig(rig: string, levels: Record<string, number>, strideMm: number): void {
  for (const tilt of TILTS) {
    for (const section of SECTIONS) {
      const track: SlabTrack = { tilt, section, strideMm }
      for (const path of SLAB_PATHS) {
        const run = cutSlab(track, path, levels)
        runs.set(keyOf(rig, tilt, section, path), run)
        const { chunks: _chunks, broken, refusals, ...read } = run
        if (refusals.length > 0)
          console.log(`${keyOf(rig, tilt, section, path)} refused: ${refusals.join(' | ')}`)
        readings.push({ rig, tilt, section, path, strideMm, cells: broken.length, ...read })
      }
    }
  }
}

function runOf(rig: string, tilt: SlabTilt, section: SlabSection, path: SlabPath): SlabRun {
  const run = runs.get(keyOf(rig, tilt, section, path))
  if (run === undefined) throw new Error(`no ${keyOf(rig, tilt, section, path)} run was cut`)
  return run
}

const perLaw = (value: number, run: SlabRun) => value / run.lawWork
const perMetre = (value: number, run: SlabRun) => value / run.metres
const thousandths = (value: number) => Math.round(value * 1000) / 1000

/** The ratios of one run to swept's at the same rig, track and ground. */
function ratiosOf(run: SlabRun, swept: SlabRun) {
  return {
    energyPerLaw: thousandths(perLaw(run.energy, run) / perLaw(swept.energy, swept)),
    heatPerLaw: thousandths(perLaw(run.heatTicks, run) / perLaw(swept.heatTicks, swept)),
    lawPerMetre: thousandths(perMetre(run.lawWork, run) / perMetre(swept.lawWork, swept)),
    cellsPerMetre: thousandths(
      perMetre(run.broken.length, run) / perMetre(swept.broken.length, swept),
    ),
  }
}

function isComparable(run: SlabRun, swept: SlabRun): boolean {
  return [run, swept].every((row) => row.lawWork > 0 && row.energy > 0)
}

/** One cell of law work as a share of swept's: the bars' quantization slack. */
function oneCellShareOf(run: SlabRun, swept: SlabRun): number {
  return run.oneCellLaw / swept.lawWork
}

/** VS's hard charge bars for a charged run against swept; #514's geometry ratios printed beside. */
function expectChargeBars(rig: string, tilt: SlabTilt, section: SlabSection, path: SlabPath) {
  const run = runOf(rig, tilt, section, path)
  const swept = runOf(rig, tilt, section, 'swept')
  const ratios = ratiosOf(run, swept)
  console.log(`${keyOf(rig, tilt, section, path)} / swept: ${JSON.stringify(ratios)}`)
  if (!isComparable(run, swept)) {
    console.log(`${keyOf(rig, tilt, section, path)}: unmeasured (nothing cut or charged)`)
    return
  }
  expect(Math.abs(ratios.energyPerLaw - 1)).toBeLessThanOrEqual(ENERGY_SHARE)
  expect(ratios.heatPerLaw).toBeGreaterThanOrEqual(1 - oneCellShareOf(run, swept))
}

/** The charge against the analytic law value, read from the ground: red beyond 1%. */
function expectAnalyticCharge(rig: string, tilt: SlabTilt, section: SlabSection, path: SlabPath) {
  const run = runOf(rig, tilt, section, path)
  if (run.lawWork === 0) return
  const expected = run.lawWork * QUANTA_PER_LAW_WORK
  const ratio = run.energy / expected
  const name = keyOf(rig, tilt, section, path)
  console.log(`${name} energy / analytic law value: ${thousandths(ratio)}`)
  if (expected < ANALYTIC_MIN_QUANTA) {
    console.log(`${name}: analytic value unmeasured (${expected.toFixed(2)} quanta, quantized)`)
    return
  }
  expect(Math.abs(ratio - 1)).toBeLessThanOrEqual(ANALYTIC_SHARE)
}

/** The TD's regression gate: the charge on or off at one cadence cuts the same, byte for byte. */
function expectSameCarve(rig: string, tilt: SlabTilt, section: SlabSection, cadence: '@12' | '@1') {
  const charged = runOf(rig, tilt, section, `exact ${cadence}`)
  const main = runOf(rig, tilt, section, `main ${cadence}`)
  expect(charged.broken).toEqual(main.broken)
  expect(charged.lawWork).toBe(main.lawWork)
  expect(charged.chunks).toBe(main.chunks)
}

function expectNoRejection(rig: string): void {
  const refused = readings.filter((row) => row.rig === rig && row.rejections > 0)
  expect(refused.map((row) => keyOf(row.rig, row.tilt, row.section, row.path))).toEqual([])
}

/** The loop lane's energy-per-law ratio to swept for a rig and section, or null without its rows. */
function loopRatioOf(rig: string, path: SlabPath, section: SlabSection): number | null {
  if (!existsSync(LOOP_REPORT)) return null
  const rows = readFileSync(LOOP_REPORT, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        JSON.parse(line) as {
          rig: string
          path: string
          section: string
          lawWork: number
          energy: number
          metres: number
        },
    )
  const rowOf = (name: string) =>
    rows.find((row) => row.rig === rig && row.path === name && row.section === section)
  const run = rowOf(path)
  const swept = rowOf('swept')
  if (run === undefined || swept === undefined) return null
  if ([run, swept].some((row) => row.metres < 10 || row.lawWork <= 0)) return null
  return run.energy / run.lawWork / (swept.energy / swept.lawWork)
}

/** The slab method against the real loop: the same ratio within 1% where the loop has the row. */
function expectLoopAgreement(rig: string, path: SlabPath, section: SlabSection) {
  const loop = loopRatioOf(rig, path, section)
  const tilt: SlabTilt = section === 'down' ? 'flat' : 'tilted'
  const run = runOf(rig, tilt, section, path)
  const swept = runOf(rig, tilt, section, 'swept')
  if (loop === null || !isComparable(run, swept)) {
    console.log(`${rig} ${path} ${section}: no loop row to validate the slab against`)
    return
  }
  const slab = ratiosOf(run, swept).energyPerLaw
  console.log(
    `${rig} ${path} ${section} energy/law over swept: slab ${slab}, loop ${thousandths(loop)}`,
  )
  expect(Math.abs(slab - loop)).toBeLessThanOrEqual(LOOP_SHARE)
}

function formatTable(rows: readonly SlabReading[]): string {
  const header =
    'rig | tilt | section | path | ticks | m | cells | law work | energy | heat ticks | ' +
    'law/m | cells/m | energy/law | heat/law | rejected'
  const lines = rows.map((row) =>
    [
      row.rig,
      row.tilt,
      row.section,
      row.path,
      row.ticks,
      row.metres.toFixed(1),
      row.cells,
      row.lawWork,
      row.energy,
      row.heatTicks,
      (row.lawWork / row.metres).toFixed(0),
      (row.cells / row.metres).toFixed(3),
      row.lawWork === 0 ? '-' : (row.energy / row.lawWork).toExponential(3),
      row.lawWork === 0 ? '-' : (row.heatTicks / row.lawWork).toExponential(3),
      row.rejections,
    ].join(' | '),
  )
  return [header, ...lines].join('\n')
}

function writeReadings(rows: readonly SlabReading[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = rows.map((row) => JSON.stringify({ ticket: 535, ...row }))
  writeFileSync(new URL('law-carry-slab.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

function describeRig(rig: string, levels: Record<string, number>, strideMm: number): void {
  it(
    `cuts the ${rig} rig's tracks on every path`,
    () => {
      playRig(rig, levels, strideMm)
      expectNoRejection(rig)
    },
    RUN_TIMEOUT_MS,
  )
  for (const tilt of TILTS) {
    for (const section of SECTIONS) {
      for (const path of CHARGED_PATHS) {
        it(`holds VS's charge bars, ${rig} ${tilt} ${section} ${path}`, () =>
          expectChargeBars(rig, tilt, section, path))
        it(`charges the analytic law value, ${rig} ${tilt} ${section} ${path}`, () =>
          expectAnalyticCharge(rig, tilt, section, path))
      }
      for (const cadence of CADENCES) {
        it(`cuts the same with the charge on or off, ${rig} ${tilt} ${section} ${cadence}`, () =>
          expectSameCarve(rig, tilt, section, cadence))
      }
    }
  }
}

describe('the slab replay at VS rigs, 25 to 3600 m/s (ticket 535)', () => {
  for (const [rig, { levels, speedMps }] of Object.entries(SPEED_RIGS)) {
    describeRig(rig, levels, strideOfRig(levels, strideOfSpeedMps(speedMps)))
  }
  for (const rig of ['25 m/s', '44 m/s']) {
    for (const path of CHARGED_PATHS) {
      for (const section of SECTIONS) {
        it(`agrees with the real loop, ${rig} ${path} ${section}`, () =>
          expectLoopAgreement(rig, path, section))
      }
    }
  }
})

describe('the slab replay on the stored ladder, 1 to 200 (ticket 535, Systems)', () => {
  for (const [rig, levels] of Object.entries(LADDER_RIGS)) {
    describeRig(rig, levels, strideOfRig(levels))
  }
})
