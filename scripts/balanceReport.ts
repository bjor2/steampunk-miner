/**
 * The balance-regression report (#29 "Run comparison output", design doc section 28): plays the
 * committed bot scenario on each of its pacing world seeds (#84), writes the first seed's events,
 * commands and summary to `balance-report/`, and prints its pacing table, each seed's row and the
 * median, the pass/fail of the three gates on that median (S11, #65) and `compareRuns` of the first
 * seed against the committed baseline summary, also into the GitHub job summary when there is
 * one. The rows slices register (`reportRows`, #223) are listed per seed and planet. The bot holding
 * assay_beacon is played on its seeds too and its median gates reported. It never fails: the
 * pacing gates are the Vitest specs `src/logging/pacingGate.test.ts` and `assayPacingGate.test.ts`.
 *
 *   npm run balance:report      the report
 *   npm run balance:baseline    the same, then the run's summary becomes the committed baseline
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PACING_WORLD_SEEDS } from '../src/constants/pacingSeeds'
import { loadFeatures } from '../src/features'
import { compareRuns, formatComparisonTable } from '../src/logging/compareRuns'
import { bandDigAlerts } from '../src/logging/bandDigReport'
import { formatNdjsonLine } from '../src/logging/ndjson'
import { reportRowLines } from '../src/logging/reportRows'
import {
  formatSeedPacingTable,
  medianPacingReport,
  seededPacingReportsOf,
  type SeededPacingReport,
} from '../src/logging/pacingMedian'
import {
  campaignPlanetAlerts,
  derivePacingReport,
  formatPacingReport,
  formatPacingVerdicts,
  pacingAlerts,
  pacingProblems,
  pacingVerdicts,
} from '../src/logging/pacingReport'
import { deriveSummary, formatRunSummary, type RunSummary } from '../src/logging/runSummary'
import { playLoggedSliceOnSeeds, type SeededSliceRun } from '../src/logging/sliceRunLog'
import { deriveWreckerDives, wreckerDiveLines } from '../src/logging/wreckerDiveReport'
import {
  spreeTargetMisses,
  spreeTargetsOf,
  spreeTargetsText,
} from '../src/systems/bot/spreeTargets'
import type { Scenario } from '../src/systems/scenario'
import { SAWTOOTH_BAND } from '../src/systems/vehicle/bandDig'

loadFeatures()

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const ASSAY_SCENARIO_FILE = new URL('../scenarios/bot-slice-assay.scenario.json', import.meta.url)
const BASELINE_FILE = new URL('../tests/balance/bot-slice.summary.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const runs = playLoggedSliceOnSeeds(scenario, PACING_WORLD_SEEDS['bot-slice'])
const { events, commands } = runs[0]
const summary = deriveSummary(events)
const pacing = derivePacingReport(events, scenario.worldSeed)
const seeds = seededPacingReportsOf(runs)
const median = medianPacingReport(seeds.map((seed) => seed.report))

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('events.ndjson', REPORT_FOLDER), events.map(formatNdjsonLine).join(''))
writeFileSync(new URL('commands.ndjson', REPORT_FOLDER), commands.map(formatNdjsonLine).join(''))
writeFileSync(new URL('summary.json', REPORT_FOLDER), formatRunSummary(summary))

const report = [
  `## Balance regression: ${scenario.name}`,
  `World seed ${scenario.worldSeed}, the baseline's:\n\n${formatPacingReport(pacing)}`,
  seedsSection(seeds),
  `### Gates on the median\n\n${formatPacingVerdicts(pacingVerdicts(median))}`,
  listSection('Pacing targets missed (these fail the build)', pacingProblems(median)),
  listSection('Alerts (reported only)', [
    ...pacingAlerts(pacing),
    ...campaignPlanetAlerts(pacing),
    ...bandDigAlerts(summary.sawtoothBandDigTicks, SAWTOOTH_BAND),
  ]),
  listSection('Tunnel wrecker (reported only, #111)', wreckerDiveLines(deriveWreckerDives(events))),
  listSection('Slice report rows (reported only, #223)', reportRowLines(runs)),
  spreeSection(runs),
  comparisonSection(summary),
  assaySection(),
].join('\n\n')
writeFileSync(new URL('report.md', REPORT_FOLDER), `${report}\n`)
console.log(report)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`)
if (process.argv.includes('--write-baseline')) {
  writeFileSync(BASELINE_FILE, formatRunSummary(summary))
  console.log('wrote tests/balance/bot-slice.summary.json')
}

function listSection(title: string, lines: readonly string[]): string {
  return `### ${title}\n\n${lines.length === 0 ? 'none' : lines.map((line) => `- ${line}`).join('\n')}`
}

/** Each seed's row and the median the gates judge (#84). */
function seedsSection(seedReports: readonly SeededPacingReport[]): string {
  return `### Seeds\n\n${formatSeedPacingTable(seedReports)}`
}

/**
 * The #180 spree targets (reported only): each seed's Workshop visits, then all seeds' visits
 * together, which the targets are judged on.
 */
function spreeSection(seededRuns: readonly SeededSliceRun[]): string {
  const seedLines = seededRuns.map(
    ({ worldSeed, run }) =>
      `seed ${worldSeed}: ${spreeTargetsText(spreeTargetsOf(run.spreeVisits))}`,
  )
  const pooled = spreeTargetsOf(seededRuns.flatMap(({ run }) => run.spreeVisits))
  return [
    listSection('Spree targets (reported only, #180)', [
      ...seedLines,
      `all seeds: ${spreeTargetsText(pooled)}`,
    ]),
    listSection('Spree targets missed on all seeds', spreeTargetMisses(pooled)),
  ].join('\n\n')
}

/** The same gates for the bot holding assay_beacon (#46 acceptance 6, #65 note 3). */
function assaySection(): string {
  const assay = JSON.parse(readFileSync(ASSAY_SCENARIO_FILE, 'utf8')) as Scenario
  const assayRuns = playLoggedSliceOnSeeds(assay, PACING_WORLD_SEEDS['bot-slice-assay'])
  const assaySeeds = seededPacingReportsOf(assayRuns)
  const assayMedian = medianPacingReport(assaySeeds.map((seed) => seed.report))
  return [
    `## Balance regression: ${assay.name}`,
    `World seed ${assay.worldSeed}:\n\n${formatPacingReport(assaySeeds[0].report)}`,
    seedsSection(assaySeeds),
    `### Gates on the median\n\n${formatPacingVerdicts(pacingVerdicts(assayMedian))}`,
  ].join('\n\n')
}

function comparisonSection(current: RunSummary): string {
  if (!existsSync(BASELINE_FILE)) return '### Against the baseline\n\nno baseline committed'
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as RunSummary
  const comparison = compareRuns(baseline, current)
  const body = comparison.ok
    ? formatComparisonTable(comparison.rows, ['baseline', 'this build'])
    : listSection('Not comparable', comparison.problems)
  return `### Against the baseline\n\n${body}`
}
