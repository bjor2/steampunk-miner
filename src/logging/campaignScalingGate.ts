/**
 * R1, the campaign scaling regression gate (#89, build plan #90). It fails on the two #81 checks
 * the curve tickets were built to: the band-5 sawtooth (C3 #86: departure at most 0.7x arrival on
 * every planet the pacing bot left, on the median of the pacing seeds, with no seed stalled before
 * the gate's last core) and the horizontal cadence of the locked schedule (H2 #88: at most 2
 * campaign planets in a row without a horizontal row). Campaign pacing (C4 #91) stays reported:
 * a miss is a finding for Systems & Economy, and the dial is named beside it.
 *
 * The gate holds no M1-M5 content module to anything (#90 scope review): the cadence counts a row
 * whatever its status, and the modules' own guards (`balance:guns`, `:refinery`, `:charges`,
 * `:heat`) stay outside it.
 */
import { CAMPAIGN_LAST_PLANET, MAX_PLANETS_WITHOUT_HORIZONTAL } from '../constants/balance'
import type { UnlockSchedule } from '../systems/unlocks/readUnlockSchedule'
import { longestRunWithoutHorizontal } from '../systems/unlocks/scheduleCadence'
import { campaignPlanetAlerts, type PacingReport } from './pacingReport'
import { medianSawtoothScores, sawtoothMisses, type SeededSawtooth } from './sawtoothMedian'

/** One seed's run as the gate judges it. */
export interface CampaignGateRun extends SeededSawtooth {
  /** Whether the run completed the core of the gate's last planet inside its budget. */
  hasCompletedLastCore: boolean
}

/**
 * The #84 ruling replaced #90's "tune only `k_casing`": the Game Director pinned it at its floor and
 * the campaign pace rows since (T7 #131, T9 #137) move `paceScale`.
 */
const CAMPAIGN_PACING_DIAL =
  'campaign pacing misses are a Systems & Economy finding: the dial is paceScale in economy.json; k_casing stays at its floor (Game Director on #84)'

/** Everything that fails the gate; empty when the campaign scaling holds. */
export function campaignScalingProblems(
  runs: readonly CampaignGateRun[],
  schedule: UnlockSchedule,
  lastPlanet: number,
): string[] {
  return [
    ...stalledSeedProblems(runs, lastPlanet),
    ...nothingJudgedProblems(runs),
    ...sawtoothMisses(runs),
    ...cadenceProblems(schedule),
  ]
}

/** Reported, never gated: each planet outside the campaign's minutes, then the dial to turn. */
export function campaignPacingFindings(report: PacingReport): string[] {
  const alerts = campaignPlanetAlerts(report)
  return alerts.length === 0 ? [] : [...alerts, CAMPAIGN_PACING_DIAL]
}

/** A seed that never finished stops the sawtooth short, so its missing planets count as a fail. */
function stalledSeedProblems(runs: readonly CampaignGateRun[], lastPlanet: number): string[] {
  return runs
    .filter((run) => !run.hasCompletedLastCore)
    .map(
      (run) =>
        `seed ${run.worldSeed} stalled on planet ${furthestPlanetOf(run)} before the core of planet ${lastPlanet}`,
    )
}

function furthestPlanetOf(run: CampaignGateRun): number {
  const planets = Object.keys(run.summary.milestones.planetReached).map(Number)
  return Math.max(0, ...planets)
}

function nothingJudgedProblems(runs: readonly CampaignGateRun[]): string[] {
  const judged = Object.keys(medianSawtoothScores(runs))
  return judged.length === 0 ? ['no seed left a planet, so the band 5 sawtooth judged nothing'] : []
}

function cadenceProblems(schedule: UnlockSchedule): string[] {
  const longest = longestRunWithoutHorizontal(schedule, CAMPAIGN_LAST_PLANET)
  if (longest <= MAX_PLANETS_WITHOUT_HORIZONTAL) return []
  return [
    `the schedule leaves ${longest} campaign planets in a row without a horizontal row, at most ${MAX_PLANETS_WITHOUT_HORIZONTAL}`,
  ]
}
