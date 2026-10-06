/**
 * The #81 sawtooth judged on the pacing seeds (C3 #86, Game Director): band 5's dig time per metre
 * at departure is at most 0.7x its time on arrival, on every planet the bot left, on the median of
 * the seeds (the #84 harness). A planet counts for a seed once the run went on to the next planet;
 * the planet a run stops on has no departure yet. With an even count of seeds the later (slower) of
 * the two middle ratios is the median, as the pacing medians take the later tick. Reported only.
 */
import { PACING_TARGETS } from '../constants/pacingTargets'
import { bandDigRatio, type BandDig } from './bandDigReport'
import type { RunSummary } from './runSummary'

/** One seed's run summary, as the sawtooth table prints it. */
export interface SeededSawtooth {
  worldSeed: number
  summary: RunSummary
}

/** Departure over arrival: 0 where the arrival only skidded and the departure digs, never null. */
type SawtoothScore = number

const SKIDS_AT_DEPARTURE: SawtoothScore = Number.POSITIVE_INFINITY

/** Planet index (as a string key) to the median score of the seeds that left it. */
export function medianSawtoothScores(runs: readonly SeededSawtooth[]): Record<string, number> {
  const planets = planetsLeftByAny(runs)
  return Object.fromEntries(planets.map((planet) => [planet, medianScoreOn(runs, planet)]))
}

/** The planets whose median band-5 dig did not get at least 30% faster during the stay. */
export function sawtoothMisses(runs: readonly SeededSawtooth[]): string[] {
  const most = PACING_TARGETS.sawtoothDepartureRatioMax
  return Object.entries(medianSawtoothScores(runs))
    .filter(([, score]) => score > most)
    .map(
      ([planet, score]) =>
        `planet ${planet} band 5 median ${scoreText(score)}, target at most ${most}x`,
    )
}

/** One row per planet left: each seed's ratio (`-` where it never left) and the median. */
export function formatSawtoothSeedTable(runs: readonly SeededSawtooth[]): string {
  const medians = medianSawtoothScores(runs)
  const rows = Object.entries(medians).map(([planet, median]) => {
    const cells = runs.map((run) => seedCellOn(run.summary, planet))
    return `| ${[planet, ...cells, scoreText(median)].join(' | ')} |`
  })
  return [
    `| planet | ${runs.map((run) => `seed ${run.worldSeed}`).join(' | ')} | median |`,
    `| --- | ${runs.map(() => '---').join(' | ')} | --- |`,
    ...rows,
  ].join('\n')
}

function planetsLeftByAny(runs: readonly SeededSawtooth[]): string[] {
  const planets = new Set(runs.flatMap((run) => Object.keys(leftPlanetDigs(run.summary))))
  return [...planets].sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
}

function medianScoreOn(runs: readonly SeededSawtooth[], planet: string): number {
  const scores = runs
    .map((run) => leftPlanetDigs(run.summary)[planet])
    .filter((dig): dig is BandDig => dig !== undefined)
    .map(sawtoothScore)
    .sort((a, b) => a - b)
  return scores[Math.floor(scores.length / 2)]
}

/** The band-5 digs of the planets the run went on from. */
function leftPlanetDigs(summary: RunSummary): Record<string, BandDig> {
  const entries = Object.entries(summary.sawtoothBandDigTicks).filter(([planet]) =>
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

function seedCellOn(summary: RunSummary, planet: string): string {
  const dig = leftPlanetDigs(summary)[planet]
  return dig === undefined ? '-' : scoreText(sawtoothScore(dig))
}

function scoreText(score: SawtoothScore): string {
  return score === SKIDS_AT_DEPARTURE ? 'no dig' : `${score.toFixed(2)}x`
}
