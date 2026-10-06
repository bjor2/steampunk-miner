/**
 * Planets 3 to 40, reported and never gated (#29 Systems & Economy note 2, #6 acceptance 7): the
 * pacing bot plays the bot scenario on past the slice and the core time of every planet is
 * printed, with a warning where it leaves 25 to 120 minutes (the lever is `paceScale(p)` in
 * economy.json). The campaign's 45 to 60 minutes per planet (#91) is warned on beside it, and so
 * is each planet's band-1 dig time at departure against arrival (the #81 sawtooth, #86). Takes a
 * few minutes; run it with `npm run balance:planets`.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { firstBandDigAlerts, formatFirstBandDigTable } from '../src/logging/firstBandDigReport'
import {
  campaignPlanetAlerts,
  derivePacingReport,
  laterPlanetAlerts,
} from '../src/logging/pacingReport'
import { deriveSummary } from '../src/logging/runSummary'
import { playLoggedSlice } from '../src/logging/sliceRunLog'
import type { Scenario } from '../src/systems/scenario'

const LAST_PLANET = 40
/** Forty planets at about an hour each, with room to see a slow one. */
const BUDGET_TICKS = 80 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const { run, events } = playLoggedSlice(scenario, {
  lastPlanet: LAST_PLANET,
  maxTicks: BUDGET_TICKS,
})
const report = derivePacingReport(events, scenario.worldSeed)
const rows = Object.entries(report.coreTicksOnPlanet).map(
  ([planet, ticks]) =>
    `| ${planet} | ${(ticks / TICKS_PER_MINUTE).toFixed(1)} min | ${report.tripsByPlanet[planet] ?? 0} |`,
)
const { firstBandDigTicks } = deriveSummary(events)
const alerts = [
  ...laterPlanetAlerts(report),
  ...campaignPlanetAlerts(report),
  ...firstBandDigAlerts(firstBandDigTicks),
]
const text = [
  `## Pacing bot, planets 1 to ${LAST_PLANET} (report only)`,
  run.isFinished
    ? ''
    : `The bot did not reach planet ${LAST_PLANET}'s core inside its budget; it stopped on planet ${run.state.planet.index}.`,
  ['| planet | core (from arrival) | trips |', '| --- | --- | --- |', ...rows].join('\n'),
  `### Band 1 dig time, arrival and departure (#81)\n\n${formatFirstBandDigTable(firstBandDigTicks)}`,
  `### Warnings\n\n${alerts.length === 0 ? 'none' : alerts.map((line) => `- ${line}`).join('\n')}`,
].join('\n\n')

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('planets.md', REPORT_FOLDER), `${text}\n`)
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
