import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { CUT_ENERGY_DENOMINATOR } from '../vehicle/cutCarry'
import { energyNumeratorOfLawWork } from './cutCarryFixtures'
import { droppedHeatShareOf } from './heatCapReadings'
import {
  isHeatAtLaw,
  isUnderRatchet,
  isUnderTankFloor,
  isWithinLawShare,
  lawChargeBarsOf,
  lawChargeTextOf,
} from './lawChargeBars'
import {
  cutSlab,
  strideOfRig,
  strideOfSpeedMps,
  type SlabRun,
  type SlabSection,
  type SlabTilt,
  type SlabTrack,
} from './lawCarrySlabFixtures'
import { LADDER_RIGS, SPEED_RIGS } from './lawSlabRigs'

// The swept cut charged on the law work it removed (ticket 540, Systems' ruling 6231144515 and its
// done-when, the TD seam 6234992964 as VS 6234998337 and the GD 6235001417 confirmed it): every
// rig and track Systems listed, the 25 and 44 m/s rigs, the stored ladder 1 to 200 with its 7 to
// 13 m/s rigs, and the fixed synthetic slab at 240 and 3600 m/s, flat and tilted, level and down,
// cut on planet 1's fixed seed by the pure authority (`lawCarrySlabFixtures.ts`), each track as
// `swept` (the shipped per-cell price) and `swept law` (`drill.sweptLawCharge` on). Law work is
// read command by command from the ground (density removed times law time at the casing grade the
// sample was cut at), the analytic law value VS ruled the reference.
//
// Gated at landing (VS, hard, `lawChargeBars.ts`): on every `swept law` row of at least 100
// quanta, energy per unit of law work within 1% of the law, under the tank floor (1.25) and the
// ratchet (1.098); on every row, the carry's exactness (quanta charged times the denominator plus
// the carry the vehicle ends on is the law work removed at the swept price), the carve and its heat
// byte-identical to the shipped swept cut (cells in order, chunks, law work, heat fed), and no
// `CommandRejected`. Rows that clear lining are among the gated ones, and their law work holds
// the lining at its grade, so the cleared lining is neither charged twice nor left out.
//
// Printed, never gated at landing (VS 6234998337, the TD 6234998891): the heat fed to the gauge
// against the law less one drill tick, which becomes a hard bar at the `drill.sweptCut` flip (if
// it falls short, the flip waits on a swept heat feed from the law tally); the share of the law
// heat the #113 cap drops, #541's line; the shipped per-cell price against the law and against
// the law charge. A lane: it runs only when named, prints the table and writes
// balance-report/swept-law-slab.ndjson.

const TILTS: readonly SlabTilt[] = ['flat', 'tilted']
const SECTIONS: readonly SlabSection[] = ['level', 'down']
const SWEPT_PATHS = ['swept', 'swept law'] as const
type SweptPath = (typeof SWEPT_PATHS)[number]
const REPORT_FOLDER = new URL('../../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 600_000

interface SweptReading extends Omit<SlabRun, 'chunks' | 'broken' | 'refusals'> {
  rig: string
  tilt: SlabTilt
  section: SlabSection
  path: SweptPath
  strideMm: number
  cells: number
}

const runs = new Map<string, SlabRun>()
const readings: SweptReading[] = []

afterAll(() => {
  console.log(formatTable(readings))
  writeReadings(readings)
})

const keyOf = (rig: string, tilt: SlabTilt, section: SlabSection, path: SweptPath) =>
  `${rig} ${tilt} ${section} ${path}`

const thousandths = (value: number) => (Math.round(value * 1000) / 1000).toFixed(3)

function playRig(rig: string, levels: Record<string, number>, strideMm: number): void {
  for (const tilt of TILTS) {
    for (const section of SECTIONS) {
      const track: SlabTrack = { tilt, section, strideMm }
      for (const path of SWEPT_PATHS) {
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

function runOf(rig: string, tilt: SlabTilt, section: SlabSection, path: SweptPath): SlabRun {
  const run = runs.get(keyOf(rig, tilt, section, path))
  if (run === undefined) throw new Error(`no ${keyOf(rig, tilt, section, path)} run was cut`)
  return run
}

/** A run's bars against the law work it removed, read command by command. */
function barsOf(run: SlabRun) {
  return lawChargeBarsOf({ ...run, lawWork: run.lawWorkCut })
}

/** VS's energy bars, hard at landing; a row under 100 quanta is quantized and logged. */
function expectLawBars(rig: string, tilt: SlabTilt, section: SlabSection) {
  const run = runOf(rig, tilt, section, 'swept law')
  const bars = barsOf(run)
  const lining = `${run.casingSamples} lining samples cleared`
  console.log(
    `${keyOf(rig, tilt, section, 'swept law')} / law: ${lawChargeTextOf(bars)}, ${lining}`,
  )
  if (!bars.isMeasurable) return
  expect(isWithinLawShare(bars.energyRatio)).toBe(true)
  expect(isUnderTankFloor(bars.energyRatio)).toBe(true)
  expect(isUnderRatchet(bars.energyRatio)).toBe(true)
}

/** The carry's exactness on every row, quantized or not: nothing paid twice, nothing lost. */
function expectExactCarry(rig: string, tilt: SlabTilt, section: SlabSection) {
  const run = runOf(rig, tilt, section, 'swept law')
  const charged = run.energy * CUT_ENERGY_DENOMINATOR + run.energyCarry
  expect(charged).toBe(energyNumeratorOfLawWork(run.lawWorkCut))
}

/** Systems' item 2: only the charge changes, the carve and its heat are the shipped swept cut's. */
function expectSameCarve(rig: string, tilt: SlabTilt, section: SlabSection) {
  const shipped = runOf(rig, tilt, section, 'swept')
  const law = runOf(rig, tilt, section, 'swept law')
  expect(law.broken).toEqual(shipped.broken)
  expect(law.chunks).toBe(shipped.chunks)
  expect(law.lawWorkCut).toBe(shipped.lawWorkCut)
  expect(law.heatTicks).toBe(shipped.heatTicks)
}

/**
 * Printed at landing, never gated (VS 6234998337): the heat fed against the law less one drill
 * tick, the flip's hard bar; what the #113 cap drops of the law heat (#541); the shipped price
 * against the law and against the law charge.
 */
function logHeatAndShipped(rig: string, tilt: SlabTilt, section: SlabSection) {
  const law = runOf(rig, tilt, section, 'swept law')
  const shipped = runOf(rig, tilt, section, 'swept')
  const bars = barsOf(law)
  const name = keyOf(rig, tilt, section, 'swept law')
  if (bars.expectedQuanta === 0) {
    console.log(`${name} (printed, not gated): nothing cut`)
    return
  }
  const heatBar = `${isHeatAtLaw(bars) ? 'meets' : 'short of'} the flip's bar`
  const dropped = thousandths(droppedHeatShareOf(law, bars.expectedHeatTicks))
  const shippedRatio = barsOf(shipped).energyRatio
  const toLaw = law.energy === 0 ? '-' : thousandths(shipped.energy / law.energy)
  console.log(
    `${name} (printed, not gated): heat fed ${thousandths(bars.heatRatio)} of the law` +
      ` (slack ${thousandths(bars.oneTickShare)}, ${heatBar}), the #113 cap drops ${dropped}` +
      ` of the law heat (#541); shipped swept ${thousandths(shippedRatio)} of the law,` +
      ` ${toLaw} of the law charge`,
  )
}

function expectNoRejection(rig: string): void {
  const refused = readings.filter((row) => row.rig === rig && row.rejections > 0)
  expect(refused.map((row) => keyOf(row.rig, row.tilt, row.section, row.path))).toEqual([])
}

function formatTable(rows: readonly SweptReading[]): string {
  const header =
    'rig | tilt | section | path | ticks | m | cells | lining | law work | energy | heat ticks | ' +
    'settleable | energy vs law | heat vs law | dropped of law | rejected'
  const lines = rows.map((row) => {
    const bars = lawChargeBarsOf({ ...row, lawWork: row.lawWorkCut })
    const isCut = row.lawWorkCut > 0
    return [
      row.rig,
      row.tilt,
      row.section,
      row.path,
      row.ticks,
      row.metres.toFixed(1),
      row.cells,
      row.casingSamples,
      row.lawWorkCut,
      row.energy,
      row.heatTicks,
      row.settleableHeatTicks,
      isCut ? thousandths(bars.energyRatio) : '-',
      isCut ? thousandths(bars.heatRatio) : '-',
      isCut ? thousandths(droppedHeatShareOf(row, bars.expectedHeatTicks)) : '-',
      row.rejections,
    ].join(' | ')
  })
  return [header, ...lines].join('\n')
}

function writeReadings(rows: readonly SweptReading[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = rows.map((row) => JSON.stringify({ ticket: 540, ...row }))
  writeFileSync(new URL('swept-law-slab.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

function describeRig(rig: string, levels: Record<string, number>, strideMm: number): void {
  it(
    `cuts the ${rig} rig's tracks swept, as shipped and charged on the law`,
    () => {
      playRig(rig, levels, strideMm)
      expectNoRejection(rig)
    },
    RUN_TIMEOUT_MS,
  )
  for (const tilt of TILTS) {
    for (const section of SECTIONS) {
      it(`charges within 1% of the analytic law, ${rig} ${tilt} ${section}`, () =>
        expectLawBars(rig, tilt, section))
      it(`keeps the carry exact on every row, ${rig} ${tilt} ${section}`, () =>
        expectExactCarry(rig, tilt, section))
      it(`cuts and heats as the shipped swept cut, ${rig} ${tilt} ${section}`, () =>
        expectSameCarve(rig, tilt, section))
      it(`prints the heat fed against the flip's bar and the shipped price, ${rig} ${tilt} ${section}`, () =>
        logHeatAndShipped(rig, tilt, section))
    }
  }
}

describe('the swept law slab at VS rigs, 25 to 3600 m/s (ticket 540)', () => {
  for (const [rig, { levels, speedMps }] of Object.entries(SPEED_RIGS)) {
    describeRig(rig, levels, strideOfRig(levels, strideOfSpeedMps(speedMps)))
  }
})

describe('the swept law slab on the stored ladder, 1 to 200 (ticket 540, Systems)', () => {
  for (const [rig, levels] of Object.entries(LADDER_RIGS)) {
    describeRig(rig, levels, strideOfRig(levels))
  }
})
