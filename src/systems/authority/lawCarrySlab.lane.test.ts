import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { onCurveSteps } from '../economy/vehicleStats'
import {
  isHeatAtLaw,
  isUnderRatchet,
  isUnderTankFloor,
  isWithinLawShare,
  lawChargeBarsOf,
  lawChargeTextOf,
  sweptVerdictOf,
} from './lawChargeBars'
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
// amendment 6228838042 as VS 6228848270 confirmed it, and the reference VS ruled on the ticket,
// 6230602042, recorded by the GD 6230602177). Every row, 25, 44, 240 and 3600 m/s and the stored
// ladder with its 7 to 13 m/s rigs, is a pure authority replay of one prescribed pose list on
// planet 1's fixed seed (`lawCarrySlabFixtures.ts`): flat and tilted 30 degrees, level through
// band 1 and down from under the surface, the same poses fed to `drillStep` (swept) and to the
// report carve with the charge on and off at 12 ticks and every tick, no body, so nothing jams.
// Law work is read from the ground (density removed times law time), energy from the tank, heat
// ticks as the report rule feeds the gauge. Gated (VS, hard, `lawChargeBars.ts`): on every row
// of at least 100 quanta, energy per unit of law work within 1% of the analytic law value, under
// the tank floor and the ratchet, and heat at least the law's less one drill tick; the regression
// gate: with the charge on or off at the same cadence the carve is byte-identical (the same
// chunks, cells in order and law work), and no `CommandRejected` on any path. Validation: when
// the loop lane's `balance-report/exact-carry.ndjson` is present, the 25 and 44 m/s ratios to the
// law agree with the real loop's within 1%. Logged, never gated: the ratio to swept (amber
// outside 5%; swept's own charge is #540's), law work per metre and cells per metre against swept
// (#514's geometry bars). A lane: it runs only when named, prints the table and writes
// balance-report/law-carry-slab.ndjson.

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
const LOOP_SHARE = 0.01
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

/** The ratio to swept, printed beside the law bars: amber outside 5%, gating nothing (#540). */
function logSweptRatios(rig: string, tilt: SlabTilt, section: SlabSection, path: SlabPath) {
  const run = runOf(rig, tilt, section, path)
  const swept = runOf(rig, tilt, section, 'swept')
  const name = keyOf(rig, tilt, section, path)
  if (!isComparable(run, swept)) {
    console.log(`${name} / swept: unmeasured (nothing cut or charged on one of them)`)
    return
  }
  const ratios = ratiosOf(run, swept)
  const verdict = `energy ${sweptVerdictOf(ratios.energyPerLaw)}, heat ${sweptVerdictOf(ratios.heatPerLaw)}`
  console.log(`${name} / swept (logged, ${verdict}): ${JSON.stringify(ratios)}`)
}

/**
 * VS's hard charge bars for a charged run against the analytic law value, read from the ground
 * (`lawChargeBars.ts`); a row under 100 quanta is quantized and logged.
 */
function expectLawBars(rig: string, tilt: SlabTilt, section: SlabSection, path: SlabPath) {
  const run = runOf(rig, tilt, section, path)
  const bars = lawChargeBarsOf(run)
  console.log(`${keyOf(rig, tilt, section, path)} / law: ${lawChargeTextOf(bars)}`)
  if (!bars.isMeasurable) return
  expect(isWithinLawShare(bars.energyRatio)).toBe(true)
  expect(isUnderTankFloor(bars.energyRatio)).toBe(true)
  expect(isUnderRatchet(bars.energyRatio)).toBe(true)
  expect(isHeatAtLaw(bars)).toBe(true)
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

/** The loop lane's energy ratio to the law for a rig, path and section, or null without the row. */
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
          heatTicks: number
          metres: number
        },
    )
  const row = rows.find(
    (read) => read.rig === rig && read.path === path && read.section === section,
  )
  if (row === undefined || row.metres < 10) return null
  const bars = lawChargeBarsOf(row)
  return bars.isMeasurable ? bars.energyRatio : null
}

/** The slab method against the real loop: the same ratio to the law within 1% where the loop has the row. */
function expectLoopAgreement(rig: string, path: SlabPath, section: SlabSection) {
  const loop = loopRatioOf(rig, path, section)
  const tilt: SlabTilt = section === 'down' ? 'flat' : 'tilted'
  const bars = lawChargeBarsOf(runOf(rig, tilt, section, path))
  if (loop === null || !bars.isMeasurable) {
    console.log(`${rig} ${path} ${section}: no loop row to validate the slab against`)
    return
  }
  const slab = thousandths(bars.energyRatio)
  console.log(`${rig} ${path} ${section} energy / law: slab ${slab}, loop ${thousandths(loop)}`)
  expect(Math.abs(slab - loop)).toBeLessThanOrEqual(LOOP_SHARE)
}

function formatTable(rows: readonly SlabReading[]): string {
  const header =
    'rig | tilt | section | path | ticks | m | cells | law work | energy | heat ticks | ' +
    'law/m | cells/m | energy/law | heat/law | energy vs law | heat vs law | rejected'
  const lines = rows.map((row) => {
    const bars = lawChargeBarsOf(row)
    return [
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
      row.lawWork === 0 ? '-' : thousandths(bars.energyRatio).toFixed(3),
      row.lawWork === 0 ? '-' : thousandths(bars.heatRatio).toFixed(3),
      row.rejections,
    ].join(' | ')
  })
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
        it(`charges and heats at the analytic law value, ${rig} ${tilt} ${section} ${path}`, () =>
          expectLawBars(rig, tilt, section, path))
        it(`logs the ratio to swept, amber outside 5%, ${rig} ${tilt} ${section} ${path}`, () =>
          logSweptRatios(rig, tilt, section, path))
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
