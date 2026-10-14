/**
 * The bore gun against the pacing bot (ticket 347, the TD's seam 3 on #314 and the Vertical
 * Scaler's pins the GD accepted), derived from the run logs only: the bot plays each pacing seed
 * twice, never firing and forced to fire at every `nextShotTick`, and per seed and planet the
 * forced run must
 *
 * - take at least 0.98x the never run's time to the planet's core (the gun buys no more than 2%);
 * - leave the planet with `drill_power` within 1 level of the never run (the money lane's
 *   departure level, `moneyLaneLines.ts`), so value shots never turn into a drill lead;
 * - fire at least 60 shots over the run, so the guard measured a gun that was used;
 * - and pass the campaign scaling gate (`campaignScalingGate.ts`: the band-5 sawtooth now, and the
 *   #304 Revision 2 growth asserts once they join that gate at the re-baseline).
 *
 * Every miss is listed; the report is the gate.
 */
import { TICKS_PER_SECOND } from '../constants/physics'
import type { UnlockSchedule } from '../systems/unlocks/readUnlockSchedule'
import { campaignScalingProblems } from './campaignScalingGate'
import { startMoneyLaneFold, type PlanetMoneyLine } from './moneyLaneLines'
import { derivePacingReport } from './pacingReport'
import type { RunEvent } from './runEvent'
import { deriveSummary } from './runSummary'

/** The forced run's time to core is at least this share of the never run's (VS pin, in bp). */
export const FORCED_CORE_TIME_MIN_BP = 9800
/** Departure `drill_power` differs from the never run's by at most this many levels (VS pin). */
export const DEPARTURE_DRILL_LEVELS_MAX = 1
/** Shots each forced run fires at least (TD seam 3). */
export const FORCED_SHOTS_MIN = 60

const BASIS_POINTS = 10_000
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

/** One policy's run on one seed, as its log and whether it finished. */
export interface BorePolicyRun {
  events: readonly RunEvent[]
  isFinished: boolean
}

/** One pacing seed played under both policies. */
export interface BoreSeedRuns {
  worldSeed: number
  never: BorePolicyRun
  forced: BorePolicyRun
}

export interface BorePlanetLine {
  worldSeed: number
  planet: number
  neverCoreTicks: number | null
  forcedCoreTicks: number | null
  /** Forced over never time to core, in basis points; null when either never reached it. */
  coreTimeBp: number | null
  neverDepartureDrill: number | null
  forcedDepartureDrill: number | null
  forcedShots: number
}

export interface BoreReport {
  lines: BorePlanetLine[]
  shotsBySeed: { worldSeed: number; shots: number }[]
  problems: string[]
}

/** Every seed's planets 1 to `lastPlanet`, and every miss of the pins. */
export function deriveBoreReport(
  seeds: readonly BoreSeedRuns[],
  schedule: UnlockSchedule,
  lastPlanet: number,
): BoreReport {
  const lines = seeds.flatMap((seed) => borePlanetLinesOf(seed, lastPlanet))
  const shotsBySeed = seeds.map(({ worldSeed, forced }) => ({ worldSeed, shots: shotsOf(forced) }))
  return {
    lines,
    shotsBySeed,
    problems: [
      ...lines.flatMap(coreTimeProblems),
      ...lines.flatMap(departureDrillProblems),
      ...shotsBySeed.flatMap(shotProblems),
      ...forcedScalingProblems(seeds, schedule, lastPlanet),
    ],
  }
}

function borePlanetLinesOf(seed: BoreSeedRuns, lastPlanet: number): BorePlanetLine[] {
  const readings = {
    never: planetReadingsOf(seed.worldSeed, seed.never),
    forced: planetReadingsOf(seed.worldSeed, seed.forced),
  }
  return Array.from({ length: lastPlanet }, (_, at) => borePlanetLineOf(seed, readings, at + 1))
}

function borePlanetLineOf(
  seed: BoreSeedRuns,
  { never, forced }: Record<'never' | 'forced', PlanetReadings>,
  planet: number,
): BorePlanetLine {
  return {
    worldSeed: seed.worldSeed,
    planet,
    neverCoreTicks: never.coreTicksOf(planet),
    forcedCoreTicks: forced.coreTicksOf(planet),
    coreTimeBp: shareBpOf(forced.coreTicksOf(planet), never.coreTicksOf(planet)),
    neverDepartureDrill: never.departureDrillOf(planet),
    forcedDepartureDrill: forced.departureDrillOf(planet),
    forcedShots: shotsOf(seed.forced, planet),
  }
}

interface PlanetReadings {
  coreTicksOf(planet: number): number | null
  departureDrillOf(planet: number): number | null
}

/** What one run's log says per planet: its time to core and its departure drill level. */
function planetReadingsOf(worldSeed: number, run: BorePolicyRun): PlanetReadings {
  const pacing = derivePacingReport(run.events, worldSeed)
  const laneLines = moneyLaneLinesOf(run.events)
  return {
    coreTicksOf: (planet: number) => pacing.coreTicksOnPlanet[String(planet)] ?? null,
    departureDrillOf: (planet: number) =>
      laneLines.find((line) => line.planet === planet)?.levels.departure.drill_power ?? null,
  }
}

function moneyLaneLinesOf(events: readonly RunEvent[]): PlanetMoneyLine[] {
  const fold = startMoneyLaneFold()
  for (const event of events) fold.add(event)
  return fold.summarize().lines
}

function shareBpOf(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null
  return Math.floor((part * BASIS_POINTS) / whole)
}

/** The forced run's `bore_fired` lines, on one planet or over the whole run. */
function shotsOf(run: BorePolicyRun, planet?: number): number {
  return run.events.filter(
    (event) => event.event === 'bore_fired' && (planet === undefined || event.planet === planet),
  ).length
}

function coreTimeProblems(line: BorePlanetLine): string[] {
  const where = `seed ${line.worldSeed} planet ${line.planet}`
  if (line.neverCoreTicks === null) return [`${where}: the never run did not reach the core`]
  if (line.forcedCoreTicks === null) return [`${where}: the forced run did not reach the core`]
  if (line.forcedCoreTicks * BASIS_POINTS >= line.neverCoreTicks * FORCED_CORE_TIME_MIN_BP) {
    return []
  }
  return [
    `${where}: the forced run reached the core in ${percentOfBp(line.coreTimeBp)} of the never run's time, under ${percentOfBp(FORCED_CORE_TIME_MIN_BP)}`,
  ]
}

function departureDrillProblems(line: BorePlanetLine): string[] {
  const { neverDepartureDrill: never, forcedDepartureDrill: forced } = line
  if (never === null || forced === null) return []
  if (Math.abs(forced - never) <= DEPARTURE_DRILL_LEVELS_MAX) return []
  return [
    `seed ${line.worldSeed} planet ${line.planet}: the forced run left with drill_power ${forced}, the never run ${never}; at most ${DEPARTURE_DRILL_LEVELS_MAX} apart`,
  ]
}

function shotProblems({ worldSeed, shots }: { worldSeed: number; shots: number }): string[] {
  if (shots >= FORCED_SHOTS_MIN) return []
  return [`seed ${worldSeed}: the forced run fired ${shots} shots, under ${FORCED_SHOTS_MIN}`]
}

function forcedScalingProblems(
  seeds: readonly BoreSeedRuns[],
  schedule: UnlockSchedule,
  lastPlanet: number,
): string[] {
  const runs = seeds.map(({ worldSeed, forced }) => ({
    worldSeed,
    summary: deriveSummary(forced.events),
    hasCompletedLastCore: forced.isFinished,
  }))
  return campaignScalingProblems(runs, schedule, lastPlanet).map(
    (problem) => `forced run, campaign scaling gate: ${problem}`,
  )
}

/** A markdown table of the lines, then the shots per seed and the misses. */
export function formatBoreReport(report: BoreReport): string {
  return [
    [
      '| seed | planet | never core | forced core | forced/never | drill_power never | drill_power forced | shots |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...report.lines.map(formatLine),
    ].join('\n'),
    `### Shots per forced run (at least ${FORCED_SHOTS_MIN})\n\n${report.shotsBySeed
      .map(({ worldSeed, shots }) => `- seed ${worldSeed}: ${shots}`)
      .join('\n')}`,
    `### Misses\n\n${
      report.problems.length === 0 ? 'none' : report.problems.map((p) => `- ${p}`).join('\n')
    }`,
  ].join('\n\n')
}

function formatLine(line: BorePlanetLine): string {
  return `| ${line.worldSeed} | ${line.planet} | ${minutesOf(line.neverCoreTicks)} | ${minutesOf(line.forcedCoreTicks)} | ${percentOfBp(line.coreTimeBp)} | ${line.neverDepartureDrill ?? '-'} | ${line.forcedDepartureDrill ?? '-'} | ${line.forcedShots} |`
}

function minutesOf(ticks: number | null): string {
  return ticks === null ? 'not reached' : `${(ticks / TICKS_PER_MINUTE).toFixed(1)} min`
}

function percentOfBp(bp: number | null): string {
  return bp === null ? '-' : `${(bp / 100).toFixed(1)}%`
}
