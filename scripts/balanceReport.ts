/**
 * The balance-regression report (#29 "Run comparison output", design doc section 28): plays the
 * committed bot scenario, writes its events, commands and summary to `balance-report/`, and
 * prints the pacing table, the pass/fail of the three gates (S11, #65) and `compareRuns` against
 * the committed baseline summary, also into the GitHub job summary when there is one. The bot
 * holding assay_beacon is played too and its gates reported. It never fails: the pacing gates are
 * the Vitest specs `src/logging/pacingGate.test.ts` and `assayPacingGate.test.ts`.
 *
 *   npm run balance:report      the report
 *   npm run balance:baseline    the same, then the run's summary becomes the committed baseline
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compareRuns, formatComparisonTable } from '../src/logging/compareRuns'
import { formatNdjsonLine } from '../src/logging/ndjson'
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
import { playLoggedSlice } from '../src/logging/sliceRunLog'
import { deriveWreckerDives, wreckerDiveLines } from '../src/logging/wreckerDiveReport'
import type { Scenario } from '../src/systems/scenario'

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const ASSAY_SCENARIO_FILE = new URL('../scenarios/bot-slice-assay.scenario.json', import.meta.url)
const BASELINE_FILE = new URL('../tests/balance/bot-slice.summary.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const { events, commands } = playLoggedSlice(scenario)
const summary = deriveSummary(events)
const pacing = derivePacingReport(events, scenario.worldSeed)

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('events.ndjson', REPORT_FOLDER), events.map(formatNdjsonLine).join(''))
writeFileSync(new URL('commands.ndjson', REPORT_FOLDER), commands.map(formatNdjsonLine).join(''))
writeFileSync(new URL('summary.json', REPORT_FOLDER), formatRunSummary(summary))

const report = [
  `## Balance regression: ${scenario.name}`,
  formatPacingReport(pacing),
  `### Gates\n\n${formatPacingVerdicts(pacingVerdicts(pacing))}`,
  listSection('Pacing targets missed (these fail the build)', pacingProblems(pacing)),
  listSection('Alerts (reported only)', [...pacingAlerts(pacing), ...campaignPlanetAlerts(pacing)]),
  listSection('Tunnel wrecker (reported only, #111)', wreckerDiveLines(deriveWreckerDives(events))),
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

/** The same gates for the bot holding assay_beacon (#46 acceptance 6, #65 note 3). */
function assaySection(): string {
  const assay = JSON.parse(readFileSync(ASSAY_SCENARIO_FILE, 'utf8')) as Scenario
  const assayPacing = derivePacingReport(playLoggedSlice(assay).events, assay.worldSeed)
  return [
    `## Balance regression: ${assay.name}`,
    formatPacingReport(assayPacing),
    `### Gates\n\n${formatPacingVerdicts(pacingVerdicts(assayPacing))}`,
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
