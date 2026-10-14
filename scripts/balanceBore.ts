/**
 * The bore gun against the pacing bot (ticket 347, the TD's seam 3 on #314, ruled by the GD): the
 * bot plays the bot scenario to planet 10's core on each pacing seed (#84) twice, never firing and
 * forced to fire at every `nextShotTick` with the gun at its walls, and `boreReport.ts` holds the
 * forced run to the Vertical Scaler's pins: time to core at least 0.98x the never run's on every
 * planet, departure `drill_power` within 1 level, at least 60 shots, and the campaign scaling gate.
 * It exits 1 on any miss. `--last-planet <n>` plays on (P40 on the headless lane at the #304/#330
 * re-baseline). Takes hours; run it with `npm run balance:bore`.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PACING_WORLD_SEEDS } from '../src/constants/pacingSeeds'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { loadFeatures } from '../src/features'
import { deriveBoreReport, formatBoreReport, type BoreSeedRuns } from '../src/logging/boreReport'
import { playLoggedSliceOnSeeds, type SeededSliceRun } from '../src/logging/sliceRunLog'
import type { BorePolicy } from '../src/systems/bot/botBore'
import type { Scenario } from '../src/systems/scenario'
import { LOCKED_SCHEDULE } from '../src/systems/unlocks/unlockSchedule'

loadFeatures()

const STANDARD_LAST_PLANET = 10
/** Two hours a planet, with room to see a slow one. */
const BUDGET_TICKS_PER_PLANET = 2 * 60 * 60 * TICKS_PER_SECOND

const SCENARIO_FILE = new URL('../scenarios/bot-slice.scenario.json', import.meta.url)
const REPORT_FOLDER = new URL('../balance-report/', import.meta.url)

const lastPlanet = lastPlanetOf(process.argv.slice(2))
const scenario = JSON.parse(readFileSync(SCENARIO_FILE, 'utf8')) as Scenario
const seeds = PACING_WORLD_SEEDS['bot-slice']
const never = playOnSeeds('never')
const forced = playOnSeeds('forced')
const report = deriveBoreReport(pairedRuns(never, forced), LOCKED_SCHEDULE, lastPlanet)
const text = [
  `## The bore gun against the pacing bot, planets 1 to ${lastPlanet}, never vs forced (gated)`,
  formatBoreReport(report),
].join('\n\n')

mkdirSync(REPORT_FOLDER, { recursive: true })
writeFileSync(new URL('bore.md', REPORT_FOLDER), `${text}\n`)
console.log(text)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
if (report.problems.length > 0) process.exitCode = 1

function lastPlanetOf(args: readonly string[]): number {
  const at = args.indexOf('--last-planet')
  if (at === -1) return STANDARD_LAST_PLANET
  const planet = Number.parseInt(args[at + 1] ?? '', 10)
  if (!Number.isSafeInteger(planet) || planet < 1) throw new Error('--last-planet takes a planet')
  return planet
}

function playOnSeeds(borePolicy: BorePolicy): SeededSliceRun[] {
  return playLoggedSliceOnSeeds(scenario, seeds, {
    lastPlanet,
    maxTicks: lastPlanet * BUDGET_TICKS_PER_PLANET,
    borePolicy,
  })
}

function pairedRuns(
  neverRuns: readonly SeededSliceRun[],
  forcedRuns: readonly SeededSliceRun[],
): BoreSeedRuns[] {
  return neverRuns.map((neverRun, at) => ({
    worldSeed: neverRun.worldSeed,
    never: { events: neverRun.events, isFinished: neverRun.run.isFinished },
    forced: { events: forcedRuns[at].events, isFinished: forcedRuns[at].run.isFinished },
  }))
}
