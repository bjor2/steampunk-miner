/**
 * The balance-regression report (#29 "Run comparison output", design doc section 28): plays the
 * committed bot scenario, writes its events, commands and summary to `balance-report/`, and
 * prints the pacing table and `compareRuns` against the committed baseline summary, also into the
 * GitHub job summary when there is one. It reports numbers and never fails: the pacing gate is
 * the Vitest spec `src/logging/pacingGate.test.ts`.
 *
 *   npm run balance:report      the report
 *   npm run balance:baseline    the same, then the run's summary becomes the committed baseline
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { compareRuns, formatComparisonTable } from '../src/logging/compareRuns'
import { formatNdjsonLine } from '../src/logging/ndjson'
import {
  derivePacingReport,
  formatPacingReport,
  pacingAlerts,
  pacingProblems,
} from '../src/logging/pacingReport'
import { deriveSummary, formatRunSummary, type RunSummary } from '../src/logging/runSummary'
import { playLoggedSlice } from '../src/logging/sliceRunLog'
import type { Scenario } from '../src/systems/scenario'

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
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
  listSection('Pacing targets missed (these fail the build)', pacingProblems(pacing)),
  listSection('Alerts (reported only)', pacingAlerts(pacing)),
  comparisonSection(summary),
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

function comparisonSection(current: RunSummary): string {
  if (!existsSync(BASELINE_FILE)) return '### Against the baseline\n\nno baseline committed'
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as RunSummary
  const comparison = compareRuns(baseline, current)
  const body = comparison.ok
    ? formatComparisonTable(comparison.rows, ['baseline', 'this build'])
    : listSection('Not comparable', comparison.problems)
  return `### Against the baseline\n\n${body}`
}
