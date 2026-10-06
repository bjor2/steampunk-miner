/**
 * The Refinery bay against the pacing bot (#105 numbers acceptance 7), reported and never gated:
 * the bot plays the bot scenario from planet 1 to planet 8's core twice, refining from planet 3
 * and ignoring the refinery, and prints each planet's core time in both runs, the #105
 * single-lever findings (a finding lowers `valueMultiplier`, floor 1.15, never `k_casing`) and the
 * realised refine gain per planet (acceptance 4). The slice planets cannot differ: the refinery
 * opens on planet 3. Takes a few minutes; run it with `npm run balance:refinery`.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { derivePacingReport, type PacingReport } from '../src/logging/pacingReport'
import {
  formatRefineGain,
  refineGainByPlanet,
  refineryLeverFindings,
} from '../src/logging/refineryReport'
import { playLoggedSlice } from '../src/logging/sliceRunLog'
import type { RefineryUse } from '../src/systems/bot/botRefining'
import type { Scenario } from '../src/systems/scenario'

const LAST_PLANET = 8
/** Eight planets at about an hour each, with room to see a slow one. */
const BUDGET_TICKS = 16 * 60 * 60 * TICKS_PER_SECOND
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario

function playRun(refinery: RefineryUse) {
  const logged = playLoggedSlice(scenario, {
    lastPlanet: LAST_PLANET,
    maxTicks: BUDGET_TICKS,
    refinery,
  })
  return { ...logged, pacing: derivePacingReport(logged.events, scenario.worldSeed) }
}

function minutes(report: PacingReport, planet: string): string {
  const ticks = report.coreTicksOnPlanet[planet]
  return ticks === undefined ? 'not reached' : `${(ticks / TICKS_PER_MINUTE).toFixed(1)} min`
}

function changeOf(refining: PacingReport, without: PacingReport, planet: string): string {
  const a = refining.coreTicksOnPlanet[planet]
  const b = without.coreTicksOnPlanet[planet]
  return a === undefined || b === undefined ? '' : `${(((a - b) / b) * 100).toFixed(1)}%`
}

const refining = playRun('used')
const without = playRun('ignored')
const planets = Array.from({ length: LAST_PLANET }, (_, index) => String(index + 1))
const rows = planets.map(
  (planet) =>
    `| ${planet} | ${minutes(refining.pacing, planet)} | ${minutes(without.pacing, planet)} | ${changeOf(refining.pacing, without.pacing, planet)} |`,
)
const findings = refineryLeverFindings(refining.pacing, without.pacing)
const unfinished = [refining, without]
  .filter((run) => !run.run.isFinished)
  .map((run) => `a run stopped on planet ${run.run.state.planet.index} inside its budget`)
const text = [
  `## Pacing bot with and without the Refinery bay, planets 1 to ${LAST_PLANET} (report only)`,
  [
    '| planet | core, refining | core, without | change |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n'),
  `### Single-lever findings (#105)\n\n${[...unfinished, ...findings].length === 0 ? 'none' : [...unfinished, ...findings].map((line) => `- ${line}`).join('\n')}`,
  `### Realised refine gain per planet\n\n${formatRefineGain(refineGainByPlanet(refining.events))}`,
].join('\n\n')

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('refinery.md', REPORT_FOLDER), `${text}\n`)
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
