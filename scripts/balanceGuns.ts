/**
 * `auto_guns` against the pacing bot (#107 numbers acceptance 5), reported and never gated: the bot
 * plays the bot scenario to planet 7's core twice, mounting the guns on planet 4 (its #107 policy)
 * and never mounting them, and the time from arriving on each of planets 4 to 7 to its core is
 * compared. A planet that moves by more than 10% is warned on; the one lever is
 * `gun.damageFractionOfDrill` (0.15 to 0.30). The gun energy and kills of the gun run's dives are
 * printed beside it. The slice (planets 1 and 2) is untouched by the guns, which open on planet 4.
 * Run it with `npm run balance:guns`.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { loadFeatures } from '../src/features'
import { deriveDiveSummaries, type DiveSummary } from '../src/logging/diveSummaries'
import { derivePacingReport } from '../src/logging/pacingReport'
import { playLoggedSlice } from '../src/logging/sliceRunLog'
import type { GunPolicy } from '../src/systems/bot/botGuns'
import type { Scenario } from '../src/systems/scenario'

loadFeatures()

const FIRST_GUN_PLANET = 4
const LAST_PLANET = 7
/** Seven planets at about an hour each, with room to see a slow one. */
const BUDGET_TICKS = 14 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const MAX_SHIFT_PERCENT = 10
const QUANTA_PER_UNIT = 240

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const withGuns = playTo(LAST_PLANET, 'mount')
const withoutGuns = playTo(LAST_PLANET, 'never')
const planets = Array.from(
  { length: LAST_PLANET - FIRST_GUN_PLANET + 1 },
  (_, at) => FIRST_GUN_PLANET + at,
)
const rows = planets.map((planet) => rowOf(planet))
const warnings = rows.filter(
  (row) => row.shiftPercent !== null && Math.abs(row.shiftPercent) > MAX_SHIFT_PERCENT,
)
const text = [
  `## auto_guns against the pacing bot, planets ${FIRST_GUN_PLANET} to ${LAST_PLANET} (report only)`,
  [
    '| planet | no guns | guns | change | gun energy (units) | gun kills |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| ${row.planet} | ${minutes(row.withoutTicks)} | ${minutes(row.withTicks)} | ${percent(row.shiftPercent)} | ${row.gunEnergyUnits} | ${row.gunKills} |`,
    ),
  ].join('\n'),
  `### Warnings\n\n${
    warnings.length === 0
      ? 'none'
      : warnings
          .map((row) => `- planet ${row.planet} moved ${percent(row.shiftPercent)} with the guns`)
          .join('\n')
  }`,
].join('\n\n')

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('guns.md', REPORT_FOLDER), `${text}\n`)
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)

function playTo(lastPlanet: number, gunPolicy: GunPolicy) {
  const { events } = playLoggedSlice(scenario, { lastPlanet, maxTicks: BUDGET_TICKS, gunPolicy })
  return {
    pacing: derivePacingReport(events, scenario.worldSeed),
    dives: deriveDiveSummaries(events),
  }
}

function rowOf(planet: number) {
  const withTicks = withGuns.pacing.coreTicksOnPlanet[String(planet)] ?? null
  const withoutTicks = withoutGuns.pacing.coreTicksOnPlanet[String(planet)] ?? null
  const dives = withGuns.dives.filter((dive) => dive.planet === planet)
  return {
    planet,
    withTicks,
    withoutTicks,
    shiftPercent:
      withTicks === null || withoutTicks === null
        ? null
        : ((withTicks - withoutTicks) * 100) / withoutTicks,
    gunEnergyUnits: sumOf(dives, (dive) => dive.gunEnergy) / QUANTA_PER_UNIT,
    gunKills: sumOf(dives, (dive) => dive.gunKills),
  }
}

function sumOf(dives: readonly DiveSummary[], read: (dive: DiveSummary) => number): number {
  return dives.reduce((total, dive) => total + read(dive), 0)
}

function minutes(ticks: number | null): string {
  return ticks === null ? 'not reached' : `${(ticks / TICKS_PER_MINUTE).toFixed(1)} min`
}

function percent(shift: number | null): string {
  return shift === null ? '-' : `${shift >= 0 ? '+' : ''}${shift.toFixed(1)}%`
}
