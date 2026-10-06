/**
 * Planets 3 to 40, reported and never gated (#29 Systems & Economy note 2, #6 acceptance 7): the
 * pacing bot plays the bot scenario on past the slice and the core time of every planet is
 * printed, with a warning where it leaves 25 to 120 minutes (the lever is `paceScale(p)` in
 * economy.json). The campaign's 45 to 60 minutes per planet (#91) is warned on beside it. The
 * scenario is played on each of its pacing seeds (#84) for the #81 sawtooth (C3 #86): band 5's dig
 * time per metre at departure against arrival, judged on the median of the seeds; the core table
 * and band 1 are the first seed's. Takes several minutes; run it with `npm run balance:planets`.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PACING_WORLD_SEEDS } from '../src/constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { loadFeatures } from '../src/features'
import { formatBandDigTable } from '../src/logging/bandDigReport'
import {
  campaignPlanetAlerts,
  derivePacingReport,
  laterPlanetAlerts,
} from '../src/logging/pacingReport'
import { deriveSummary } from '../src/logging/runSummary'
import { formatSawtoothSeedTable, sawtoothMisses } from '../src/logging/sawtoothMedian'
import { playLoggedSliceOnSeeds } from '../src/logging/sliceRunLog'
import type { Scenario } from '../src/systems/scenario'
import { SAWTOOTH_BAND } from '../src/systems/vehicle/bandDig'

loadFeatures()

const LAST_PLANET = 40
/** Forty planets at about an hour each, with room to see a slow one. */
const BUDGET_TICKS = 80 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const FIRST_BAND = 1

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const runs = playLoggedSliceOnSeeds(scenario, PACING_WORLD_SEEDS['bot-slice'], {
  lastPlanet: LAST_PLANET,
  maxTicks: BUDGET_TICKS,
})
const { run, events } = runs[0]
const report = derivePacingReport(events, scenario.worldSeed)
const rows = Object.entries(report.coreTicksOnPlanet).map(
  ([planet, ticks]) =>
    `| ${planet} | ${(ticks / TICKS_PER_MINUTE).toFixed(1)} min | ${report.tripsByPlanet[planet] ?? 0} |`,
)
const summary = deriveSummary(events)
const seededSummaries = runs.map((seeded) => ({
  worldSeed: seeded.worldSeed,
  summary: deriveSummary(seeded.events),
}))
const alerts = [
  ...laterPlanetAlerts(report),
  ...campaignPlanetAlerts(report),
  ...sawtoothMisses(seededSummaries),
]
const text = [
  `## Pacing bot, planets 1 to ${LAST_PLANET} (report only)`,
  run.isFinished
    ? ''
    : `The bot did not reach planet ${LAST_PLANET}'s core inside its budget; on world seed ${scenario.worldSeed} it stopped on planet ${run.state.planet.index}.`,
  ['| planet | core (from arrival) | trips |', '| --- | --- | --- |', ...rows].join('\n'),
  `### Band ${SAWTOOTH_BAND} dig time, departure over arrival, per seed (#81, #86)\n\n${formatSawtoothSeedTable(seededSummaries)}`,
  `### Band ${SAWTOOTH_BAND} dig time, world seed ${scenario.worldSeed}\n\n${formatBandDigTable(summary.sawtoothBandDigTicks, SAWTOOTH_BAND)}`,
  `### Band ${FIRST_BAND} dig time, world seed ${scenario.worldSeed} (reported, not judged)\n\n${formatBandDigTable(summary.firstBandDigTicks, FIRST_BAND)}`,
  `### Warnings\n\n${alerts.length === 0 ? 'none' : alerts.map((line) => `- ${line}`).join('\n')}`,
].join('\n\n')

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('planets.md', REPORT_FOLDER), `${text}\n`)
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
