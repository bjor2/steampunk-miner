import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEV_FLAGS, type DevFlags } from '../constants/devFlags'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { submitCommand } from '../store/authorityLink'
import { useGameStore } from '../store/gameStore'
import { setCasingGradeCommand } from '../systems/authority/casingDebugCommands'
import { withDrillExactCarry } from '../systems/authority/cutCarryFixtures'
import { lawChargeBarsOf, lawChargeTextOf } from '../systems/authority/lawChargeBars'
import {
  barVerdictsOf,
  lawReadingOf,
  thousandthsOf,
  type LawReading,
} from '../systems/authority/lawWorkFixtures'
import { buildIntent } from '../systems/input/buildIntent'
import { LAW_WORK_PER_DRILL_TICK } from '../systems/vehicle/cutCarry'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { createRig, type Rig, type TickRead } from './cutFollowFixtures'
import { openDigSpeedWindow, type DigSpeedSums } from './digSpeedWindow'

// The dig-speed STOP of #514 (Done-when 3): the Vertical Scaler's bars (6226431087, with Systems
// 6226435006 and the TD's v2 ruling 6226459471; energy and heat per unit of law work, VS on A5
// 6226528512) at a report every tick on the flag-off path against the swept law-exact path at the
// same rig and ground, down and level, in the real loop and Rapier body:
// - logged, bar 4 (1a, charged per unit of law work): the charge a report every tick ships with
//   (`drill.exactCarry` on: every tick takes only with it, TD 6236464931; both stay off for Bjor
//   until #541) against the analytic law value (`lawChargeBars.ts`) and against swept. The gate
//   is A6's: VS ruled the reference on #535 (6230602042, recorded by the GD 6230602177) the law,
//   never swept's own charge, which pays 0.62 to 1.74 times the law by its geometry (#540), and
//   `exactCarry.lane.test.ts` gates a report every tick in the loop with the charge on, as the
//   fixed track does at 3 to 44 m/s (`systems/authority/digSpeedTrack.lane.test.ts`);
// - logged, the carve geometry (bar 1b, law work per metre from the ground, `lawWorkFixtures.ts`,
//   at least 1.000 of swept less one cell and at most 1.050; bar 3, cells per metre within 5%):
//   the carve-geometry ticket #537 owns them, and until it lands #514's ratchet reads them on the
//   fixed track (`systems/authority/digSpeedTrack.lane.test.ts`), loop rows logged beside it (VS
//   6228847292 item 4 as the TD quotes it on #537, GD 6228851107 and 6228937772);
// - logged, bar 2 as redefined (VS 6228841725, GD 6228851107): law work per yielded cell at a
//   report every tick over swept's, amber outside 5%.
// Rigs: `sweptCutPace.test.ts`'s (23 ticks a band-1 cell on planet 1, about 3 m/s) and a strong rig
// (drill power 200, tip 600: 8 to 13 m/s, the VS's 7 to 13 m/s rows; the stored-200 rig's swept
// cut jumps the body tens of metres a tick on planet 1 in the loop, so it reads nothing). Each path
// leaves the pad and plays a leg down, then one level west, each read over the same metres after
// an 8 m lead-in so every path reads the same ground, lined at casing grade 5 so a cave-in never
// crushes it; a tow back to the dock (a jump over 1.5 m in a tick) or a stall ends the read early
// and is logged. Logged beside the bars: speed, energy and heat per metre, drilled ticks per metre
// and per yielded cell (the withdrawn definitions, kept as diagnostics), and the 12-tick cadence
// (#514's kill-switch off, today's game). The 25 to 3600 m/s and tilted rows are an authority
// replay, `systems/authority/digSpeedTrack.lane.test.ts`. A lane: it runs only when named, prints
// the table and writes balance-report/dig-speed-stop.ndjson.

type Section = 'down' | 'level'

interface LoopRig {
  levels: Record<string, number>
  /** Each leg's read length after its lead-in; the level leg is the VS's 250 m window or near. */
  readMetres: Readonly<Record<Section, number>>
}
const RIGS: Readonly<Record<string, LoopRig>> = {
  'law 21': {
    levels: { drill_tip: 600, engine: 5000, drill_power: 4 },
    readMetres: { down: 70, level: 150 },
  },
  'power 12': {
    levels: { drill_power: 12, drill_tip: 600, hull: 5000 },
    readMetres: { down: 70, level: 250 },
  },
}
/** A path: the client's flags and the authority's `drill.exactCarry`. */
interface Path {
  flags: DevFlags
  isExactCarry: boolean
}
// Every tick takes only with the exact carry on and ships with it (TD 6236464931); every 12 is the
// game as it ships today, the exact carry off.
const PATHS: Readonly<Record<string, Path>> = {
  swept: { flags: { ...DEV_FLAGS, 'drill.sweptCut': true }, isExactCarry: false },
  'every tick': {
    flags: { 'drill.sweptCut': false, 'drill.reportEveryTick': true },
    isExactCarry: true,
  },
  'every 12': {
    flags: { 'drill.sweptCut': false, 'drill.reportEveryTick': false },
    isExactCarry: false,
  },
}
const FRAMES_PER_SECOND = 60
/** Each leg leaves this much behind it before its read starts: the turn and the first bite. */
const LEAD_IN_M = 8
/** A leg that has not gone its metres in this long has stalled; its read ends there. */
const LEG_TICKS_MAX = Math.round(240 / PHYSICS_TIMESTEP)
/** Lining strong enough that a cave-in never crushes a leg (the #516 lane's down legs). */
const CASING_GRADE = 5
/** A move this long in one tick is a tow back to the dock, not driving. */
const TOW_JUMP_M = 1.5
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RIG_TIMEOUT_MS = 900_000

/** How a held stretch ended: its metres gone, a tow back to the dock, or a stall. */
type StretchEnd = 'gone' | 'towed' | 'stalled'

/** One read stretch of one leg. */
interface LegReading extends LawReading {
  rig: string
  path: string
  section: Section
  end: StretchEnd
  metres: number
  metresPerSecond: number
  drilledTicksPerMetre: number
  drilledTicksPerCell: number
  /** The leg's law work in drill ticks, drill energy in quanta and heat ticks fed, summed. */
  lawTicks: number
  drillEnergy: number
  heatTicks: number
}

const readings: LegReading[] = []
let sink: MemorySink

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

afterAll(() => {
  console.log(formatTable(readings))
  writeReadings(readings)
})

/** A fresh rig on `path` leaves the pad, then plays and reads a leg down and a leg level. */
function playPath(rigName: string, path: string): LegReading[] {
  return withDrillExactCarry(PATHS[path].isExactCarry, () => playLegsOnPath(rigName, path))
}

function playLegsOnPath(rigName: string, path: string): LegReading[] {
  const loopRig = RIGS[rigName]
  const rig = createRig(RAPIER, loopRig.levels, FRAMES_PER_SECOND, PATHS[path].flags)
  submitCommand(useGameStore.getState().playerId, setCasingGradeCommand(CASING_GRADE))
  rig.hold(buildIntent(['aim_left']), Math.round(2 / PHYSICS_TIMESTEP))
  const at = { rigName, path, loopRig }
  return [
    playLeg(rig, at, 'down', buildIntent(['aim_down'])),
    playLeg(rig, at, 'level', buildIntent(['aim_left'])),
  ]
}

/** Holds `intent` for the lead-in, then reads the leg's next metres one tick at a time. */
function playLeg(
  rig: Rig,
  at: { rigName: string; path: string; loopRig: LoopRig },
  section: Section,
  intent: VehicleIntent,
): LegReading {
  holdAlong(rig, intent, LEAD_IN_M, () => undefined)
  const window = openDigSpeedWindow(sink)
  const end = holdAlong(rig, intent, at.loopRig.readMetres[section], window.note)
  return { rig: at.rigName, path: at.path, section, end, ...legColumnsOf(window.sums()) }
}

/** Holds `intent` one tick at a time until the body has gone `metres`, passing each tick on. */
function holdAlong(
  rig: Rig,
  intent: VehicleIntent,
  metres: number,
  each: (read: TickRead) => void,
): StretchEnd {
  let last = rig.hold(intent, 1)[0].position
  let gone = 0
  for (let tick = 1; tick < LEG_TICKS_MAX; tick++) {
    const read = rig.hold(intent, 1)[0]
    const step = Math.hypot(read.position.x - last.x, read.position.y - last.y)
    if (step > TOW_JUMP_M) return 'towed'
    each(read)
    gone += step
    if (gone >= metres) return 'gone'
    last = read.position
  }
  return 'stalled'
}

function legColumnsOf(sums: DigSpeedSums) {
  return {
    metres: thousandthsOf(sums.metres),
    metresPerSecond: thousandthsOf(sums.metres / sums.seconds),
    ...lawReadingOf(sums),
    drilledTicksPerMetre: thousandthsOf(sums.drilledTicks / sums.metres),
    drilledTicksPerCell: thousandthsOf(sums.drilledTicks / sums.law.yieldedCells),
    lawTicks: sums.law.ticks,
    drillEnergy: sums.drillEnergy,
    heatTicks: sums.heatTicks,
  }
}

function formatTable(rows: readonly LegReading[]): string {
  const columns = Object.keys(rows[0] ?? {}) as (keyof LegReading)[]
  const lines = rows.map((row) => columns.map((column) => row[column]).join(' | '))
  return [columns.join(' | '), ...lines].join('\n')
}

function writeReadings(rows: readonly LegReading[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = rows.map((row) => JSON.stringify({ ticket: 514, ...row }))
  writeFileSync(new URL('dig-speed-stop.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

function legOf(rig: string, path: string, section: Section): LegReading {
  const found = readings.find(
    (row) => row.rig === rig && row.path === path && row.section === section,
  )
  if (found === undefined) throw new Error(`no ${rig} ${path} ${section} leg was played`)
  return found
}

/** What a leg removed, in density sub-steps, and what it charged, as A6's bars read them. */
function chargeReadOf(leg: LegReading) {
  return {
    lawWork: leg.lawTicks * LAW_WORK_PER_DRILL_TICK,
    energy: leg.drillEnergy,
    heatTicks: leg.heatTicks,
  }
}

/** The every-tick leg's bars against the swept leg, and the ratios they read, for the message. */
function verdictsOf(rig: string, section: Section) {
  const everyTick = legOf(rig, 'every tick', section)
  const swept = legOf(rig, 'swept', section)
  const ratios = {
    lawWorkPerMetre: thousandthsOf(everyTick.lawWorkPerMetre / swept.lawWorkPerMetre),
    lawTicksPerCellOverSwept: thousandthsOf(everyTick.lawTicksPerCell / swept.lawTicksPerCell),
    cellsPerMetre: thousandthsOf(everyTick.cellsPerMetre / swept.cellsPerMetre),
    energyPerLawTick: thousandthsOf(everyTick.energyPerLawTick / swept.energyPerLawTick),
    heatPerLawTick: thousandthsOf(everyTick.heatPerLawTick / swept.heatPerLawTick),
    quantization: swept.oneCellShare,
  }
  return { verdicts: barVerdictsOf(everyTick, swept), message: JSON.stringify(ratios) }
}

describe('dig speed at a report every tick against the swept law-exact path (#514 STOP)', () => {
  for (const rig of Object.keys(RIGS)) {
    it(
      `plays the ${rig} rig on the swept cut and both flag-off cadences, down and level`,
      () => {
        const played = Object.keys(PATHS).flatMap((path) => playPath(rig, path))
        readings.push(...played)
        const compared = played.filter((leg) => leg.path !== 'every 12')
        expect(compared.map((leg) => leg.end)).toEqual(['gone', 'gone', 'gone', 'gone'])
      },
      RIG_TIMEOUT_MS,
    )

    for (const section of ['down', 'level'] as const) {
      it(`logs the carve geometry against the swept path, ${rig} ${section} (bars 1b, 2, 3)`, () => {
        const { verdicts, message } = verdictsOf(rig, section)
        const held = { lawWorkPerMetre: verdicts.lawWorkPerMetre, cells: verdicts.cellsPerMetre }
        console.log(`${rig} ${section} geometry (logged): ${message} ${JSON.stringify(held)}`)
        expect(legOf(rig, 'every tick', section).metres).toBeGreaterThan(0)
      })

      it(`logs the every-tick charge against the law and swept, ${rig} ${section} (bar 4)`, () => {
        const { message } = verdictsOf(rig, section)
        const bars = lawChargeBarsOf(chargeReadOf(legOf(rig, 'every tick', section)))
        console.log(
          `${rig} ${section} charge (logged): law ${lawChargeTextOf(bars)}, swept ${message}`,
        )
        expect(bars.expectedQuanta).toBeGreaterThan(0)
      })
    }
  }
})
