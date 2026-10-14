/**
 * The pace pins of a run forced onto a whole lane (ticket 266, the Aetheric lane's three-seed pace
 * re-run; Systems on #245): on the median of the pacing seeds (#84), planet 1's core within 58
 * minutes of the start, the slice inside 100-110 and planet 8 at 45 minutes or more from arrival.
 * The 58, the 45 and the 100-110 are #146's pins (docs/economy/pace-baseline.md); the slice and
 * the P8 floor are judged as `balance:forks` judges a branch (`forkPace.ts`).
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import {
  FORK_PACE_PINS,
  forkPaceOf,
  forkPaceVerdictOf,
  medianTicks,
  minutesOfTicks,
  type ForkPace,
  type ForkPaceTally,
  type ForkPaceVerdict,
} from './forkPace'

export const LANE_PACE_PINS = {
  ...FORK_PACE_PINS,
  firstPlanet: 1,
  maxFirstCoreMinutes: 58,
} as const

const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND

/** A forced run's pace, in ticks; null for a core never completed. */
export interface LanePace extends ForkPace {
  /** Planet 1's core from the start of the run. */
  firstCoreTicks: number | null
}

export interface LanePaceVerdict extends ForkPaceVerdict {
  medianFirstCoreTicks: number | null
  isFirstCoreInTime: boolean
}

export function lanePaceOf(tally: ForkPaceTally): LanePace {
  const firstCoreTicks = tally.coreTick.get(LANE_PACE_PINS.firstPlanet) ?? null
  return { ...forkPaceOf(tally), firstCoreTicks }
}

/** One branch's seeds held to the three pins. */
export function lanePaceVerdictOf(branch: string, paces: readonly LanePace[]): LanePaceVerdict {
  const medianFirstCoreTicks = medianTicks(paces.map((pace) => pace.firstCoreTicks))
  return {
    ...forkPaceVerdictOf(branch, paces),
    medianFirstCoreTicks,
    isFirstCoreInTime: isWithinMinutes(medianFirstCoreTicks, LANE_PACE_PINS.maxFirstCoreMinutes),
  }
}

/** One line per pin a branch's median misses. */
export function lanePaceMissesOf(verdicts: readonly LanePaceVerdict[]): string[] {
  return verdicts.flatMap(missesOf)
}

/** The medians as a Markdown table, minutes, a miss marked. */
export function lanePaceTableOf(verdicts: readonly LanePaceVerdict[]): string {
  return [
    '| branch | P1 core | slice | P8 | |',
    '|---|---|---|---|---|',
    ...verdicts.map(
      (verdict) =>
        `| ${verdict.branch} | ${minutesOfTicks(verdict.medianFirstCoreTicks)} | ` +
        `${minutesOfTicks(verdict.medianSliceTicks)} | ` +
        `${minutesOfTicks(verdict.medianPlanetTicks)} | ${markOf(verdict)} |`,
    ),
  ].join('\n')
}

function missesOf(verdict: LanePaceVerdict): string[] {
  const { firstPlanet, maxFirstCoreMinutes, sliceMinutes, planet, minPlanetMinutes } =
    LANE_PACE_PINS
  const pins = [
    { isMet: verdict.isFirstCoreInTime, miss: `P${firstPlanet} core over ${maxFirstCoreMinutes}` },
    { isMet: verdict.isSliceInBand, miss: `slice outside ${sliceMinutes.min}-${sliceMinutes.max}` },
    { isMet: verdict.isPlanetSlowEnough, miss: `P${planet} under ${minPlanetMinutes}` },
  ]
  return pins.filter((pin) => !pin.isMet).map((pin) => `${verdict.branch}: ${pin.miss} minutes`)
}

/** The table's mark column. */
function markOf(verdict: LanePaceVerdict): string {
  return missesOf(verdict).length > 0 ? 'miss' : ''
}

function isWithinMinutes(ticks: number | null, minutes: number): boolean {
  return ticks !== null && ticks <= minutes * TICKS_PER_MINUTE
}
