/**
 * `blasting_charges` against the pacing bot (#109 numbers acceptance 3 and 4), reported and never
 * gated, like `balance:guns`.
 *
 * 1. The trade (`blastTrade.ts`): for planets 7 to 10, the on-curve vehicle and one 12 drill levels
 *    behind it, each band's drill time per tile over the `minTicksPerTile` floor, ore money a minute
 *    drilling against blasting, and the time to push a shaft 3 tiles deeper either way. Acceptance 3
 *    wants blasting to earn less a minute wherever a tile takes at most 2x the floor, and to reach
 *    the next band faster at 4x or more.
 * 2. The bot plays the bot scenario to planet 10's core twice, blasting (its #109 policy) and never,
 *    and the time from arriving on each of planets 7 to 10 to its core is compared. Acceptance 4
 *    wants every planet inside C4 (45 to 60 min) with the bot blasting, and none more than 10%
 *    faster than without charges; the one lever is the price per charge (1 to 4 band-5 units).
 *
 * The slice is untouched by charges, which open on planet 7. Run it with `npm run balance:charges`.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PACING_TARGETS } from '../src/constants/pacingTargets'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { derivePacingReport } from '../src/logging/pacingReport'
import type { RunEvent } from '../src/logging/runEvent'
import type { RunEventName } from '../src/logging/eventNames'
import { playLoggedSlice } from '../src/logging/sliceRunLog'
import { blastTradeOf, type BlastTrade } from '../src/systems/bot/blastTrade'
import type { ChargePolicy } from '../src/systems/bot/botCharges'
import { onCurveLevels, vehicleStatsAt } from '../src/systems/economy/vehicleStats'
import type { Scenario } from '../src/systems/scenario'
import { planetParamsFor } from '../src/systems/world/planetParams'

const FIRST_CHARGE_PLANET = 7
const LAST_PLANET = 10
const BANDS = [1, 2, 3, 4, 5]
const DRILL_LEVELS_BEHIND = 12
/** Ten planets at about an hour each, with room to see a slow one. */
const BUDGET_TICKS = 20 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const MAX_SPEED_UP_PERCENT = 10
const QUICK_FLOOR_MULTIPLE = 2
const SLOW_FLOOR_MULTIPLE = 4

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const planets = Array.from(
  { length: LAST_PLANET - FIRST_CHARGE_PLANET + 1 },
  (_, at) => FIRST_CHARGE_PLANET + at,
)
const trades = planets.flatMap((planet) => tradeRowsOf(planet))
const blasting = playTo('blast')
const drilling = playTo('never')
const rows = planets.map((planet) => paceRowOf(planet))
const warnings = [...tradeWarnings(), ...paceWarnings()]
const text = [
  `## blasting_charges against the pacing bot, planets ${FIRST_CHARGE_PLANET} to ${LAST_PLANET} (report only)`,
  '### The trade (acceptance 3)',
  [
    '| planet | drill | band | ticks/tile | x floor | drill $/min | blast $/min | 3 tiles drilled | 3 tiles blasted |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...trades.map(
      ({ planet, drill, trade }) =>
        `| ${planet} | ${drill} | ${trade.band} | ${trade.drillTicksPerTile} | ${trade.floorMultiple.toFixed(1)} | ${perMinute(trade.drillMoneyPerTick)} | ${perMinute(trade.blastMoneyPerTick)} | ${seconds(trade.drillAdvanceTicks)} | ${seconds(trade.blastAdvanceTicks)} |`,
    ),
  ].join('\n'),
  '### The bot (acceptance 4)',
  [
    '| planet | no charges | charges | change | restocks | blasts | inside C4 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.planet} | ${minutes(row.drillingTicks)} | ${minutes(row.blastingTicks)} | ${percent(row.shiftPercent)} | ${row.restocks} | ${row.blasts} | ${row.isInsideC4 ? 'yes' : 'no'} |`,
    ),
  ].join('\n'),
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
      const trade = blastTradeOf(params, vehicleStatsAt(levels), band)
      return trade === null ? [] : [{ planet, drill, trade }]
    }),
  )
}

function tradeWarnings(): string[] {
  return trades.flatMap(({ planet, drill, trade }) => {
    const where = `planet ${planet} band ${trade.band} (${drill}, ${trade.floorMultiple.toFixed(1)}x floor)`
    const isQuick = trade.floorMultiple <= QUICK_FLOOR_MULTIPLE
    const isSlow = trade.floorMultiple >= SLOW_FLOOR_MULTIPLE
    if (isQuick && trade.blastMoneyPerTick >= trade.drillMoneyPerTick) {
      return [`${where}: blasting earns at least drilling`]
    }
    if (isSlow && trade.blastAdvanceTicks >= trade.drillAdvanceTicks) {
      return [`${where}: blasting is no faster to the next band`]
    }
    return []
  })
}

function playTo(chargePolicy: ChargePolicy) {
  const { events } = playLoggedSlice(scenario, {
    lastPlanet: LAST_PLANET,
    maxTicks: BUDGET_TICKS,
    chargePolicy,
  })
  return { pacing: derivePacingReport(events, scenario.worldSeed), events }
}

function paceRowOf(planet: number) {
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
    restocks: linesOn(blasting.events, 'charges_restocked', planet),
    blasts: linesOn(blasting.events, 'charge_detonated', planet),
    isInsideC4:
      blastingTicks !== null &&
      blastingTicks >= min * TICKS_PER_MINUTE &&
      blastingTicks <= max * TICKS_PER_MINUTE,
  }
}

function paceWarnings(): string[] {
  return rows.flatMap((row) => [
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

function linesOn(events: readonly RunEvent[], name: RunEventName, planet: number): number {
  return events.filter((event) => event.event === name && event.planet === planet).length
}

function perMinute(moneyPerTick: number): string {
  return (moneyPerTick * TICKS_PER_MINUTE).toPrecision(3)
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
