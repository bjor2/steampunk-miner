/**
 * `blasting_charges` and the dynamite sizes against the pacing bot (#109 numbers acceptance 3 and
 * 4, #143 guard 1, #153 amendment points 4 and 5, K8 #218), reported and never gated, like
 * `balance:guns`.
 *
 * 1. The shipped charge's trade (`blastTrade.ts`): for planets 7 to 10, the on-curve vehicle and one
 *    12 drill levels behind it, each band's drill time per tile over the `minTicksPerTile` floor,
 *    ore money a minute drilling against blasting, and the time to push a shaft 3 tiles deeper
 *    either way. Acceptance 3 wants blasting to earn less a minute wherever a tile takes at most 2x
 *    the floor, and to reach the next band faster at 4x or more.
 * 2. The size guard (`chargeSizeTrade.ts`): every size on its unlock planet and planet 40, in every
 *    band, at 24 and 45 ticks a tile, the net ore money a minute of a blast against the drill, at
 *    the band's ore density (the guard: never above the drill) and centred on a full patch
 *    (reported; #143 amendment 2 accepts sizes 1 and 2 above the drill there).
 * 3. The bot plays the bot scenario to planet 40's core on each pacing seed, blasting (its #109
 *    policy) and never, and each planet's median time from arriving to its core is compared. C4
 *    wants every planet at 45 to 60 min with the bot blasting and none more than 10% faster than
 *    without charges: judged on planets 7 to 10, and logged as a diagnostic on planets 13 to 34 and
 *    40 until #148's dynamite gates give the bot a reason to blast there (Vertical Scaler on #149).
 *    The one lever is the price per charge, never moved from the soft rows.
 *
 * The slice is untouched by charges, which open on planet 7. Run it with `npm run balance:charges`;
 * the forty-planet runs take a while.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PACING_TARGETS } from '../src/constants/pacingTargets'
import { PACING_WORLD_SEEDS } from '../src/constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { loadFeatures } from '../src/features'
import { medianPacingReport } from '../src/logging/pacingMedian'
import { derivePacingReport, type PacingReport } from '../src/logging/pacingReport'
import type { RunEvent } from '../src/logging/runEvent'
import type { RunEventName } from '../src/logging/eventNames'
import { playLoggedSlice } from '../src/logging/sliceRunLog'
import { blastTradeOf, type BlastTrade } from '../src/systems/bot/blastTrade'
import type { ChargePolicy } from '../src/systems/bot/botCharges'
import {
  chargeSizeTradesOf,
  isBlastAboveDrill,
  isPatchBlastAboveDrill,
  type ChargeSizeTrade,
} from '../src/systems/bot/chargeSizeTrade'
import { formatAmount } from '../src/systems/displayAmount'
import { stepsOfMajors } from '../src/systems/economy/upgradeSteps'
import { onCurveLevels, vehicleStatsAt } from '../src/systems/economy/vehicleStats'
import {
  cmp,
  div,
  fromSafeInteger,
  mul,
  roundToWhole,
  toCanonical,
  type Money,
} from '../src/systems/money'
import type { Scenario } from '../src/systems/scenario'
import { planetParamsFor } from '../src/systems/world/planetParams'

loadFeatures()

const FIRST_CHARGE_PLANET = 7
const LAST_JUDGED_PLANET = 10
/** C4 also runs here, soft until #148 (#153 amendment point 5, Vertical Scaler on #149). */
const DIAGNOSTIC_PLANETS = [...range(13, 34), 40]
const LAST_PLANET = 40
const BANDS = [1, 2, 3, 4, 5]
const DRILL_LEVELS_BEHIND = 12
/** Forty planets at about an hour each, with room to see a slow one. */
const BUDGET_TICKS = 80 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const MAX_SPEED_UP_PERCENT = 10
const QUICK_FLOOR_MULTIPLE = 2
const SLOW_FLOOR_MULTIPLE = 4
/** The run-log lines the pace rows count per planet. */
const COUNTED_LINES: readonly RunEventName[] = ['charges_restocked', 'charge_detonated']

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const SEEDS = PACING_WORLD_SEEDS['bot-slice']
const judgedPlanets = range(FIRST_CHARGE_PLANET, LAST_JUDGED_PLANET)
const trades = judgedPlanets.flatMap((planet) => tradeRowsOf(planet))
const sizeTrades = chargeSizeTradesOf(scenario.worldSeed)
const blasting = playTo('blast')
const drilling = playTo('never')
const judgedRows = judgedPlanets.map((planet) => paceRowOf(planet))
const diagnosticRows = DIAGNOSTIC_PLANETS.map((planet) => paceRowOf(planet))
const warnings = [...tradeWarnings(), ...sizeGuardWarnings(), ...paceWarnings()]
const text = [
  `## blasting_charges and the dynamite sizes against the pacing bot (report only)`,
  '### The shipped charge trade, planets 7 to 10 (#109 acceptance 3)',
  [
    '| planet | drill | band | ticks/tile | x floor | drill $/min | blast $/min | 3 tiles drilled | 3 tiles blasted |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...trades.map(
      ({ planet, drill, trade }) =>
        `| ${planet} | ${drill} | ${trade.band} | ${trade.drillTicksPerTile} | ${trade.floorMultiple.toFixed(1)} | ${perMinute(trade.drillMoneyPerTick)} | ${perMinute(trade.blastMoneyPerTick)} | ${seconds(trade.drillAdvanceTicks)} | ${seconds(trade.blastAdvanceTicks)} |`,
    ),
  ].join('\n'),
  '### The size guard: every size on its unlock planet and planet 40 (#143 guard 1, K8 #218)',
  [
    '| size | planet | band | ticks/tile | cycle | drill $/min | blast $/min | blast / drill | patch drill $/min | patch blast $/min | patch blast / drill |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...sizeTrades.map(
      (trade) =>
        `| ${trade.size} | ${trade.planetIndex} | ${trade.band} | ${trade.drillTicksPerTile} | ${seconds(trade.cycleTicks)} | ${perMinute(trade.drillMoneyPerTick)} | ${perMinute(trade.blastMoneyPerTick)} | ${ratio(trade.blastMoneyPerTick, trade.drillMoneyPerTick)} | ${perMinute(trade.patchDrillMoneyPerTick)} | ${perMinute(trade.patchBlastMoneyPerTick)} | ${ratio(trade.patchBlastMoneyPerTick, trade.patchDrillMoneyPerTick)} |`,
    ),
  ].join('\n'),
  `### Centred on a full patch, above the drill (reported: #143 amendment 2)\n\n${patchFindingsText()}`,
  `### The bot, planets 7 to 10 (C4, judged; median of seeds ${SEEDS.join(', ')})`,
  paceTableOf(judgedRows),
  '### The bot, planets 13 to 34 and 40 (C4, diagnostic until #148)',
  paceTableOf(diagnosticRows),
  `### Warnings\n\n${warnings.length === 0 ? 'none' : warnings.map((line) => `- ${line}`).join('\n')}`,
].join('\n\n')

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('charges.md', REPORT_FOLDER), `${text}\n`)
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)

interface TradeRow {
  planet: number
  drill: string
  trade: BlastTrade
}

interface CountedLine {
  name: RunEventName
  planet: number | undefined
}

interface PolicyRuns {
  pacing: PacingReport
  counted: CountedLine[]
}

interface PaceRow {
  planet: number
  blastingTicks: number | null
  drillingTicks: number | null
  shiftPercent: number | null
  restocks: number
  blasts: number
  isInsideC4: boolean
}

function tradeRowsOf(planet: number): TradeRow[] {
  const params = planetParamsFor(scenario.worldSeed, planet)
  const onCurve = onCurveLevels(planet)
  const behind = {
    ...onCurve,
    drill_power: Math.max(0, onCurve.drill_power - DRILL_LEVELS_BEHIND),
    drill_tip: Math.max(0, onCurve.drill_tip - DRILL_LEVELS_BEHIND),
  }
  return [
    { drill: 'on curve', levels: onCurve },
    { drill: `${DRILL_LEVELS_BEHIND} behind`, levels: behind },
  ].flatMap(({ drill, levels }) =>
    BANDS.flatMap((band) => {
      const trade = blastTradeOf(params, vehicleStatsAt(stepsOfMajors(levels)), band)
      return trade === null ? [] : [{ planet, drill, trade }]
    }),
  )
}

function tradeWarnings(): string[] {
  return trades.flatMap(({ planet, drill, trade }) => {
    const where = `planet ${planet} band ${trade.band} (${drill}, ${trade.floorMultiple.toFixed(1)}x floor)`
    const isQuick = trade.floorMultiple <= QUICK_FLOOR_MULTIPLE
    const isSlow = trade.floorMultiple >= SLOW_FLOOR_MULTIPLE
    if (isQuick && cmp(trade.blastMoneyPerTick, trade.drillMoneyPerTick) >= 0) {
      return [`${where}: blasting earns at least drilling`]
    }
    if (isSlow && trade.blastAdvanceTicks >= trade.drillAdvanceTicks) {
      return [`${where}: blasting is no faster to the next band`]
    }
    return []
  })
}

function sizeGuardWarnings(): string[] {
  return sizeTrades
    .filter(isBlastAboveDrill)
    .map((trade) => `${whereOf(trade)}: blasting earns more than drilling at the band's density`)
}

function patchFindingsText(): string {
  const above = sizeTrades.filter(isPatchBlastAboveDrill)
  if (above.length === 0) return 'none'
  return above
    .map(
      (trade) =>
        `- ${whereOf(trade)}: ${ratio(trade.patchBlastMoneyPerTick, trade.patchDrillMoneyPerTick)} the drill`,
    )
    .join('\n')
}

function whereOf(trade: ChargeSizeTrade): string {
  return `size ${trade.size} planet ${trade.planetIndex} band ${trade.band} at ${trade.drillTicksPerTile} ticks/tile`
}

/**
 * Each seed's run is cut down to its pacing report and line counts before the next one plays: six
 * forty-planet logs held at once outgrow node's heap.
 */
function playTo(chargePolicy: ChargePolicy): PolicyRuns {
  const runs = SEEDS.map((worldSeed) => {
    const options = { lastPlanet: LAST_PLANET, maxTicks: BUDGET_TICKS, chargePolicy }
    const { events } = playLoggedSlice({ ...scenario, worldSeed }, options)
    return { report: derivePacingReport(events, worldSeed), counted: countedLinesOf(events) }
  })
  return {
    pacing: medianPacingReport(runs.map((run) => run.report)),
    counted: runs.flatMap((run) => run.counted),
  }
}

/** The lines the pace rows count, kept as name and planet only. */
function countedLinesOf(events: readonly RunEvent[]): CountedLine[] {
  return events
    .filter((event) => COUNTED_LINES.includes(event.event))
    .map((event) => ({ name: event.event, planet: event.planet }))
}

function paceRowOf(planet: number): PaceRow {
  const blastingTicks = blasting.pacing.coreTicksOnPlanet[String(planet)] ?? null
  const drillingTicks = drilling.pacing.coreTicksOnPlanet[String(planet)] ?? null
  const { min, max } = PACING_TARGETS.campaignPlanetMinutes
  return {
    planet,
    blastingTicks,
    drillingTicks,
    shiftPercent:
      blastingTicks === null || drillingTicks === null
        ? null
        : ((blastingTicks - drillingTicks) * 100) / drillingTicks,
    restocks: linesOn(blasting.counted, 'charges_restocked', planet),
    blasts: linesOn(blasting.counted, 'charge_detonated', planet),
    isInsideC4:
      blastingTicks !== null &&
      blastingTicks >= min * TICKS_PER_MINUTE &&
      blastingTicks <= max * TICKS_PER_MINUTE,
  }
}

function paceTableOf(rows: readonly PaceRow[]): string {
  return [
    '| planet | no charges | charges | change | restocks (all seeds) | blasts (all seeds) | inside C4 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.planet} | ${minutes(row.drillingTicks)} | ${minutes(row.blastingTicks)} | ${percent(row.shiftPercent)} | ${row.restocks} | ${row.blasts} | ${row.isInsideC4 ? 'yes' : 'no'} |`,
    ),
  ].join('\n')
}

/** Planets 7 to 10 only: the diagnostic rows never warn (Vertical Scaler on #149). */
function paceWarnings(): string[] {
  return judgedRows.flatMap((row) => [
    ...(row.isInsideC4 ? [] : [c4MissOf(row.planet, row.blastingTicks)]),
    ...(row.shiftPercent !== null && row.shiftPercent < -MAX_SPEED_UP_PERCENT
      ? [`planet ${row.planet} sped up ${percent(row.shiftPercent)} with charges`]
      : []),
  ])
}

function c4MissOf(planet: number, ticks: number | null): string {
  if (ticks === null)
    return `planet ${planet}'s core was not reached with charges in the run budget`
  return `planet ${planet} took ${minutes(ticks)} with charges, outside C4`
}

function linesOn(lines: readonly CountedLine[], name: RunEventName, planet: number): number {
  return lines.filter((line) => line.name === name && line.planet === planet).length
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, at) => from + at)
}

/** Whole money a minute: the rates are Money, as prices pass 1e308 on later planets (#196). */
function perMinute(moneyPerTick: Money): string {
  return formatAmount(roundToWhole(mul(moneyPerTick, fromSafeInteger(TICKS_PER_MINUTE))))
}

/** `a / b` to two places, signed: a blast that loses money reads below zero. */
function ratio(a: Money, b: Money): string {
  return `${Number(toCanonical(div(a, b))).toFixed(2)}x`
}

function seconds(ticks: number): string {
  return `${(ticks / TICKS_PER_SECOND).toFixed(1)} s`
}

function minutes(ticks: number | null): string {
  return ticks === null ? 'not reached' : `${(ticks / TICKS_PER_MINUTE).toFixed(1)} min`
}

function percent(shift: number | null): string {
  return shift === null ? '-' : `${shift >= 0 ? '+' : ''}${shift.toFixed(1)}%`
}
