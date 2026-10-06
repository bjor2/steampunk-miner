/**
 * The heat planets against the pacing bot (spec #113 numbers acceptance 4), reported and never
 * gated: the bot plays the bot scenario from planet 1 to planet 10's core, unlocking refractory on
 * planet 8 (its #113 policy), and planets 8 to 10 are printed with their core time against the
 * campaign's 45 to 60 minutes (C4), the refractory it laid and what heat and lava did. A planet
 * outside the target is a balance finding whose one lever is the `bandHeat` scale (0.8 to 1.2
 * times), never `k_casing`. Takes the better part of an hour; run it with `npm run balance:heat`.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { loadFeatures } from '../src/features'
import { formatHeatPlanetLines, heatPlanetLines } from '../src/logging/heatReport'
import { derivePacingReport } from '../src/logging/pacingReport'
import { playLoggedSlice } from '../src/logging/sliceRunLog'
import type { Scenario } from '../src/systems/scenario'

loadFeatures()

const FIRST_HEAT_PLANET = 8
const LAST_PLANET = 10
/** Ten planets at about an hour each, with room to see a slow one. */
const BUDGET_TICKS = 20 * 60 * 60 * TICKS_PER_SECOND

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const { run, events } = playLoggedSlice(scenario, {
  lastPlanet: LAST_PLANET,
  maxTicks: BUDGET_TICKS,
})
const pacing = derivePacingReport(events, scenario.worldSeed)
const planets = Array.from(
  { length: LAST_PLANET - FIRST_HEAT_PLANET + 1 },
  (_, at) => FIRST_HEAT_PLANET + at,
)
const lines = heatPlanetLines(events, pacing, planets)
const misses = lines.filter((line) => line.isInCampaignTarget !== true)
const text = [
  `## Heat planets against the pacing bot, planets ${FIRST_HEAT_PLANET} to ${LAST_PLANET} (report only)`,
  run.isFinished
    ? ''
    : `The bot did not reach planet ${LAST_PLANET}'s core inside its budget; it stopped on planet ${run.state.planet.index}.`,
  formatHeatPlanetLines(lines),
  `### Findings\n\n${
    misses.length === 0
      ? 'none'
      : misses
          .map(
            (line) =>
              `- planet ${line.planet} is outside 45 to 60 minutes; the one lever is the bandHeat scale (0.8 to 1.2)`,
          )
          .join('\n')
  }`,
].join('\n\n')

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('heat.md', REPORT_FOLDER), `${text}\n`)
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
