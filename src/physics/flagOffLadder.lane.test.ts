import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { onCurveSteps } from '../systems/economy/vehicleStats'
import { playFlagOffLeg, type FlagOffLeg, type LegSection } from './flagOffLegFixtures'

// The loop gates of #514 on the flag-off path, the cadence a player drills at (Done-when 1, 2 and
// 9; Systems 6224566206 and its addendum 6224580153, the TD's 6224603228): the ladder of stored
// rigs 1, 10, 20, 50, 100 and 200, down 80 m and level 150 m, at 12-tick reports (main, the
// kill-switch off) and a report every tick (#514), in the real loop and Rapier body.
// Asserted, at a report every tick:
// - A >= main: whole-leg mean speed at least the 12-tick leg's, every rung, down and level, and so
//   the start-rig anchor (stored 1, 80 m down: the TD read 1.43 -> 1.52 m/s);
// - backward ticks at most 1% of a down leg and 5% of a level leg (Done-when 1);
// - VS's flag-off stand-in for `cutSmoothness` (VS 6228847292, item 5: flag-off has no commanded
//   cut speed to hold): backward share, under-half share and press to first cut each no worse
//   than the 12-tick leg's, every rung, down and level;
// - press to first cut (from the head facing the leg's way) at most 1 tick, as the median over the
//   rungs (Done-when 2);
// - release: the median creep of the down legs no further than at 12 ticks, and the median rest
//   within 30 ticks; each rung's creep, its ticks to rest and any tow after release are logged.
// Logged: cells a second against the bot's modelled speed for the rig (Systems' flag past 1.25),
// law work a metre at every rung, under-half ticks, where a rig reaches the 15 (down) or 22
// (level) cells a second pose bound, and each on-curve planet-1 to planet-3 drill's down-leg speed
// over the stored-1 start rig's (the ratio bands, 2.2x by the end of P1 and 3x in P2, are read by
// Systems; on planet 1's ground, so the cap rows are a floor for the rig on its own planet). A
// lane: it runs only when named, prints the table and writes
// balance-report/flag-off-ladder.ndjson.

const P200 = onCurveSteps(200)
const RIG_SAFETY = { hull: 5000, cargo_hold: 56 }

/** The on-curve drill of `planet` (#20 curve), for the ratio bands read from the ladder. */
function onCurveRig(planet: number): Record<string, number> {
  const steps = onCurveSteps(planet)
  return { drill_power: steps.drill_power, drill_tip: steps.drill_tip, ...RIG_SAFETY }
}
const RUNGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0, ...RIG_SAFETY },
  'stored 10': { drill_power: 10, drill_tip: 0, ...RIG_SAFETY },
  'stored 20': { drill_power: 20, drill_tip: 0, ...RIG_SAFETY },
  'stored 50': { drill_power: 50, drill_tip: 0, ...RIG_SAFETY },
  'stored 100': { drill_power: 100, drill_tip: 0, ...RIG_SAFETY },
  'stored 200': { drill_power: P200.drill_power, drill_tip: P200.drill_tip, ...RIG_SAFETY },
  ...Object.fromEntries([1, 2, 3].map((planet) => [`on-curve P${planet}`, onCurveRig(planet)])),
}
const LEG_METRES: Readonly<Record<LegSection, number>> = { down: 80, level: 150 }
const INTERVALS = [12, 1]
const BARS = {
  backwardShare: { down: 0.01, level: 0.05 },
  pressToFirstCutTicks: 1,
  ticksToRest: 30,
  botSpeedFlag: 1.25,
  poseBoundCellsPerSecond: { down: 15, level: 22 },
}
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUNG_TIMEOUT_MS = 900_000

interface LadderRow extends FlagOffLeg {
  rung: string
}

const rows: LadderRow[] = []
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
  console.log(formatTable(rows))
  console.log([...flagsOf(rows), ...ratioBandsOf(rows)].join('\n'))
  writeRows(rows)
})

function playRung(rung: string): LadderRow[] {
  return (['down', 'level'] as const).flatMap((section) =>
    INTERVALS.map((interval) => {
      const metres = LEG_METRES[section]
      const leg = playFlagOffLeg(RAPIER, sink, { levels: RUNGS[rung], section, interval, metres })
      return { rung, ...leg }
    }),
  )
}

function rowOf(rung: string, section: LegSection, interval: number): LadderRow {
  const found = rows.find(
    (row) => row.rung === rung && row.section === section && row.interval === interval,
  )
  if (found === undefined) throw new Error(`no ${rung} ${section} leg at ${interval}`)
  return found
}

/** The log lines: the bot-speed flag and where the pose bound binds. */
function flagsOf(ladder: readonly LadderRow[]): string[] {
  return ladder
    .filter((row) => row.interval === 1)
    .map((row) => {
      const overBot = row.cellsPerSecond / row.botCellsPerSecond
      const bound = BARS.poseBoundCellsPerSecond[row.section]
      return [
        `${row.rung} ${row.section}: loop/bot ${overBot.toFixed(3)}`,
        overBot > BARS.botSpeedFlag ? '(over 1.25: flag to Systems)' : '',
        row.metresPerSecond >= bound ? `reaches the ${bound} cells/s pose bound` : '',
      ].join(' ')
    })
}

/** Each on-curve rig's down-leg speed over the stored-1 start rig's, at a report every tick. */
function ratioBandsOf(ladder: readonly LadderRow[]): string[] {
  const start = ladder.find((row) => isEveryTickDown(row) && row.rung === 'stored 1')
  if (start === undefined) return []
  return ladder
    .filter((row) => isEveryTickDown(row) && row.rung.startsWith('on-curve'))
    .map(
      (row) =>
        `${row.rung} / stored 1, down: ${(row.metresPerSecond / start.metresPerSecond).toFixed(3)}`,
    )
}

function isEveryTickDown(row: LadderRow): boolean {
  return row.interval === 1 && row.section === 'down'
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function formatTable(ladder: readonly LadderRow[]): string {
  const columns = Object.keys(ladder[0] ?? {}) as (keyof LadderRow)[]
  const lines = ladder.map((row) => columns.map((column) => row[column]).join(' | '))
  return [columns.join(' | '), ...lines].join('\n')
}

function writeRows(ladder: readonly LadderRow[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = ladder.map((row) => JSON.stringify({ ticket: 514, ...row }))
  writeFileSync(new URL('flag-off-ladder.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

describe('the flag-off loop ladder at a report every tick against 12 ticks (#514, lane)', () => {
  for (const rung of Object.keys(RUNGS)) {
    it(
      `plays the ${rung} rig down and level at both cadences`,
      () => {
        const played = playRung(rung)
        rows.push(...played)
        expect(played).toHaveLength(4)
      },
      RUNG_TIMEOUT_MS,
    )

    for (const section of ['down', 'level'] as const) {
      it(`goes no slower than 12-tick reports, ${rung} ${section} (A >= main)`, () => {
        const ratio =
          rowOf(rung, section, 1).metresPerSecond / rowOf(rung, section, 12).metresPerSecond
        console.log(`${rung} ${section}: every tick / 12 ticks = ${ratio.toFixed(3)}`)
        expect(ratio).toBeGreaterThanOrEqual(1)
      })

      it(`moves backward on at most the bar's share of ticks, ${rung} ${section}`, () => {
        expect(rowOf(rung, section, 1).backwardShare).toBeLessThanOrEqual(
          BARS.backwardShare[section],
        )
      })

      it(`moves backward and under half speed no more than 12-tick reports, ${rung} ${section}`, () => {
        const [everyTick, every12] = [rowOf(rung, section, 1), rowOf(rung, section, 12)]
        expect(everyTick.backwardShare).toBeLessThanOrEqual(every12.backwardShare)
        expect(everyTick.underHalfShare).toBeLessThanOrEqual(every12.underHalfShare)
      })

      it(`cuts no later after the press than 12-tick reports, ${rung} ${section}`, () => {
        const pressOf = (interval: number) =>
          rowOf(rung, section, interval).pressToFirstCutTicks ?? Infinity
        expect(pressOf(1)).toBeLessThanOrEqual(pressOf(12))
      })
    }
  }

  it('creeps no further after release on the down legs than 12-tick reports, as the median', () => {
    const creepAt = (interval: number) =>
      medianOf(
        rows
          .filter((row) => row.interval === interval && row.section === 'down')
          .map((row) => row.releaseCreepMetres),
      )
    console.log(`median down-leg creep: every tick ${creepAt(1)} m, 12 ticks ${creepAt(12)} m`)
    expect(creepAt(1)).toBeLessThanOrEqual(creepAt(12))
  })

  it('cuts within a tick of the press, as the median over the rungs', () => {
    const presses = rows.filter((row) => row.interval === 1).map((row) => row.pressToFirstCutTicks)
    expect(medianOf(presses.map((ticks) => ticks ?? Infinity))).toBeLessThanOrEqual(
      BARS.pressToFirstCutTicks,
    )
  })

  it('comes to rest within 30 ticks of the release, as the median over the rungs', () => {
    const rests = rows.filter((row) => row.interval === 1).map((row) => row.ticksToRest)
    console.log(`ticks to rest, every tick: ${JSON.stringify(rests)}`)
    expect(medianOf(rests.map((ticks) => ticks ?? Infinity))).toBeLessThanOrEqual(BARS.ticksToRest)
  })
})
