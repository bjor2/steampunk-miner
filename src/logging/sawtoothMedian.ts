/**
 * The #81 sawtooth judged on the pacing seeds (C3 #86, Game Director): band 5's dig time per metre
 * at departure is at most 0.7x its time on arrival, on every planet the bot left, on the median of
 * the seeds (the #84 harness). A planet counts for a seed once the run went on to the next planet;
 * the planet a run stops on has no departure yet. With an even count of seeds the later (slower) of
 * the two middle ratios is the median, as the pacing medians take the later tick. Reported only.
 *
 * Each leg is judged on its own, through the upgrade that binds it (#723's drive-bound law, Game
 * Director on #762): the leg down through the drill, the sideways leg through the slower of the
 * drill and the drive. The bar is the same 0.7x for both.
 */
import { PACING_TARGETS } from '../constants/pacingTargets'
import { bandDigRatio, type BandDig } from './bandDigReport'
import { drillLeadsText } from './planetLeads'
import type { RunSummary } from './runSummary'

/** A leg of the band-5 dig, named for the way the cut faces. */
export type SawtoothLeg = 'down' | 'sideways'

/** The legs the sawtooth judges, in the order its table prints them. */
export const SAWTOOTH_LEGS: readonly SawtoothLeg[] = ['down', 'sideways']

const LEG_DIGS: Record<SawtoothLeg, (summary: RunSummary) => Record<string, BandDig>> = {
  down: (summary) => summary.sawtoothBandDigTicks,
  sideways: (summary) => summary.sawtoothSidewaysDigTicks,
}

/** One seed's run summary, as the sawtooth table prints it. */
export interface SeededSawtooth {
  worldSeed: number
  summary: RunSummary
}

/** Departure over arrival: 0 where the arrival only skidded and the departure digs, never null. */
type SawtoothScore = number

const SKIDS_AT_DEPARTURE: SawtoothScore = Number.POSITIVE_INFINITY

/** Planet index (as a string key) to the leg's median score of the seeds that left it. */
export function medianSawtoothScores(
  runs: readonly SeededSawtooth[],
  leg: SawtoothLeg,
): Record<string, number> {
  const planets = planetsLeftByAny(runs, leg)
  return Object.fromEntries(planets.map((planet) => [planet, medianScoreOn(runs, planet, leg)]))
}

/** Every leg's planets whose median band-5 dig did not get at least 30% faster during the stay. */
export function sawtoothMisses(runs: readonly SeededSawtooth[]): string[] {
  return SAWTOOTH_LEGS.flatMap((leg) =>
    Object.keys(medianSawtoothScores(runs, leg)).flatMap((planet) =>
      sawtoothMissesOn(runs, Number.parseInt(planet), leg),
    ),
  )
}

/** The leg's miss on one planet, or none where it met the bar or no seed left the planet. */
export function sawtoothMissesOn(
  runs: readonly SeededSawtooth[],
  planet: number,
  leg: SawtoothLeg,
): string[] {
  const most = PACING_TARGETS.sawtoothDepartureRatioMax
  const score = medianSawtoothScores(runs, leg)[String(planet)]
  if (score === undefined || score <= most) return []
  return [`planet ${planet} band 5 ${leg} median ${scoreText(score)}, target at most ${most}x`]
}

/** The planets at least one seed left: the planets the sawtooth judges. */
export function sawtoothJudgedPlanets(runs: readonly SeededSawtooth[]): string[] {
  return planetsLeftByAny(runs, 'down')
}

/**
 * One row per planet left and leg: each seed's ratio with its drill and tip leads on arrival and
 * at departure (`-` where it never left), and the median.
 */
export function formatSawtoothSeedTable(runs: readonly SeededSawtooth[]): string {
  const rows = sawtoothJudgedPlanets(runs).flatMap((planet) =>
    SAWTOOTH_LEGS.map((leg) => seedRowOn(runs, planet, leg)),
  )
  return [
    `| planet | leg | ${runs.map((run) => `seed ${run.worldSeed}`).join(' | ')} | median |`,
    `| --- | --- | ${runs.map(() => '---').join(' | ')} | --- |`,
    ...rows,
  ].join('\n')
}

function seedRowOn(runs: readonly SeededSawtooth[], planet: string, leg: SawtoothLeg): string {
  const cells = runs.map((run) => seedCellOn(run.summary, planet, leg))
  const median = medianSawtoothScores(runs, leg)[planet]
  const medianCell = median === undefined ? '-' : scoreText(median)
  return `| ${[planet, leg, ...cells, medianCell].join(' | ')} |`
}

function planetsLeftByAny(runs: readonly SeededSawtooth[], leg: SawtoothLeg): string[] {
  const planets = new Set(runs.flatMap((run) => Object.keys(leftPlanetDigs(run.summary, leg))))
  return [...planets].sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
}

function medianScoreOn(runs: readonly SeededSawtooth[], planet: string, leg: SawtoothLeg): number {
  const scores = runs
    .map((run) => leftPlanetDigs(run.summary, leg)[planet])
    .filter((dig): dig is BandDig => dig !== undefined)
    .map(sawtoothScore)
    .sort((a, b) => a - b)
  return scores[Math.floor(scores.length / 2)]
}

/** The leg's band-5 digs of the planets the run went on from. */
function leftPlanetDigs(summary: RunSummary, leg: SawtoothLeg): Record<string, BandDig> {
  const entries = Object.entries(LEG_DIGS[leg](summary)).filter(([planet]) =>
    hasLeftPlanet(summary, planet),
  )
  return Object.fromEntries(entries)
}

function hasLeftPlanet(summary: RunSummary, planet: string): boolean {
  return summary.milestones.planetReached[String(Number.parseInt(planet) + 1)] !== undefined
}

function sawtoothScore(dig: BandDig): SawtoothScore {
  if (dig.departure === null) return SKIDS_AT_DEPARTURE
  return bandDigRatio(dig) ?? 0
}

function seedCellOn(summary: RunSummary, planet: string, leg: SawtoothLeg): string {
  const dig = leftPlanetDigs(summary, leg)[planet]
  if (dig === undefined) return '-'
  const leads = drillLeadsText(summary.planetLevels, planet)
  return leads === ''
    ? scoreText(sawtoothScore(dig))
    : `${scoreText(sawtoothScore(dig))} (${leads})`
}

function scoreText(score: SawtoothScore): string {
  return score === SKIDS_AT_DEPARTURE ? 'no dig' : `${score.toFixed(2)}x`
}
