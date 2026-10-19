/**
 * The per-planet drill bars of the GD ruling on #551 (point 5, ticket 552) judged on the pacing
 * seeds, each on the median of the seeds (#84). Before #559 VS split them for the bot lane (its
 * whole-tick clock priced time a cell too high, so only the conservative bars gated, 6254671302).
 * Since ticket 559 the bot bores on the scripted sub-step clock at real cells a second, so the
 * lower bounds on time and the cadence and spend bars gate too (#559 done-when, GD amendment 2 and
 * VS on #551):
 *
 *   gated   planet minutes 22 to 30 on P2-P10, the longest drill-only gap at most 10 minutes,
 *           planet-average felt speed at least 5 cells/s through P10 and at least 0.9x the planet
 *           before, 3 to 4 drill purchases a planet, the tank never empty, every planet's core
 *           reached (no stalled planet), drill + tip majors 3.5 to 7.0 a planet, the other tracks'
 *           spend (hold, boiler, engine and hull, the #559 list) at most 6% of track spend from P2
 *           and 15% on P1, and at most 50 hold, boiler and engine purchases a planet (the
 *           catch-up burst)
 *   printed all-track majors 3.5 to 6.0 a planet, the income gain per purchase (amber under +5%
 *           twice in a row), level 20 by the end of P4 and 50 not before P5, the band-1 felt speed
 *           at the core at most 44 cells/s, drill + tip majors amber at 7, and the spend share
 *           without the hull beside the gated one
 *
 * A miss is a balance finding for Systems (retune order: paceScale rows, then ore sale prices,
 * never the law), never a reason to retune the bot or a bar.
 */
import {
  add,
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
} from '../systems/money'
import {
  amberIncomeGainsOf,
  averageFeltOf,
  CATCH_UP_TRACKS,
  incomeGainsOf,
  longestGapMinutesOf,
  planetMinutesOf,
  type DrillPaceTally,
  type PlanetDrillPace,
} from './drillPace'

export const DRILL_PACE_BARS = {
  lastPlanet: 10,
  firstTimedPlanet: 2,
  planetMinutes: { min: 22, max: 30 },
  drillGapMinutesMax: 10,
  feltCellsPerSecondMin: 5,
  feltRatioToPreviousMin: 0.9,
  drillPurchasesPerPlanet: { min: 3, max: 4 },
  majorsPerPlanet: { min: 3.5, max: 6 },
  drillTipMajorsPerPlanet: { min: 3.5, max: 7, amber: 7 },
  otherSpendShareBpMax: { planet1: 1500, later: 600 },
  catchUpPurchasesMax: 50,
  coreFeltCellsPerSecondMax: 44,
  level20ByEndOfPlanet: 4,
  level50NotBeforePlanet: 5,
} as const

/** One seed's run: its tally and whether the bot reached the last planet's core. */
export interface DrillPaceRun {
  worldSeed: number
  tally: DrillPaceTally
}

/** A planet's medians over the seeds; a seed that never reached the planet reads null. */
export interface PlanetMedians {
  planet: number
  minutes: number | null
  drillPurchases: number | null
  averageFelt: number | null
  coreFelt: number | null
  longestGapMinutes: number | null
  majors: number | null
  drillTipMajors: number | null
  otherSpendShareBp: number | null
  otherSpendShareWithHullBp: number | null
  catchUpPurchases: number | null
}

const BASIS_POINTS = 10000
/** The other tracks whose spend share VS bars (ticket 553); with the hull or without is open. */
const OTHER_SPEND_TRACKS: readonly string[] = CATCH_UP_TRACKS
const OTHER_SPEND_TRACKS_WITH_HULL: readonly string[] = [...CATCH_UP_TRACKS, 'hull']

const PLANETS = Array.from({ length: DRILL_PACE_BARS.lastPlanet }, (_, at) => at + 1)

export function planetMediansOf(runs: readonly DrillPaceRun[]): PlanetMedians[] {
  return PLANETS.map((planet) => {
    const paces = runs.map((run) => run.tally.planets.get(planet) ?? null)
    return {
      planet,
      minutes: medianOf(paces.map((pace) => (pace === null ? null : planetMinutesOf(pace)))),
      drillPurchases: medianOf(paces.map((pace) => pace?.drillPurchases ?? null)),
      averageFelt: medianOf(paces.map((pace) => (pace === null ? null : averageFeltOf(pace)))),
      coreFelt: medianOf(paces.map((pace) => pace?.coreFelt ?? null)),
      longestGapMinutes: medianOf(paces.map(gapOrNull)),
      majors: medianOf(paces.map((pace) => pace?.majors ?? null)),
      drillTipMajors: medianOf(paces.map((pace) => pace?.drillTipMajors ?? null)),
      otherSpendShareBp: medianOf(paces.map((pace) => shareOrNull(pace, OTHER_SPEND_TRACKS))),
      otherSpendShareWithHullBp: medianOf(
        paces.map((pace) => shareOrNull(pace, OTHER_SPEND_TRACKS_WITH_HULL)),
      ),
      catchUpPurchases: medianOf(paces.map((pace) => pace?.catchUpPurchases ?? null)),
    }
  })
}

function shareOrNull(pace: PlanetDrillPace | null, tracks: readonly string[]): number | null {
  return pace === null ? null : spendShareBpOf(pace, tracks)
}

/**
 * The share of the planet's track spend that went to `tracks`, in whole basis points; null with
 * no spend. VS bars it at 600 bp on P2-P12 and 1500 bp on P1 (ticket 553 body).
 */
export function spendShareBpOf(pace: PlanetDrillPace, tracks: readonly string[]): number | null {
  const spends = Object.entries(pace.trackSpend)
  const total = spends.reduce((sum, [, spent]) => add(sum, spent), ZERO_MONEY)
  if (cmp(total, ZERO_MONEY) === 0) return null
  const share = spends
    .filter(([track]) => tracks.includes(track))
    .reduce((sum, [, spent]) => add(sum, spent), ZERO_MONEY)
  return toSafeInteger(floor(div(mul(share, fromSafeInteger(BASIS_POINTS)), total)))
}

function gapOrNull(pace: PlanetDrillPace | null): number | null {
  return pace === null ? null : longestGapMinutesOf(pace)
}

/** The middle value, a null (never reached) sorting after every number. */
function medianOf(values: readonly (number | null)[]): number | null {
  const sorted = [...values].sort((a, b) => (a ?? Infinity) - (b ?? Infinity))
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

/** The bars the lane gates, as problems; empty when they hold. */
export function gatedDrillPaceProblemsOf(runs: readonly DrillPaceRun[]): string[] {
  const medians = planetMediansOf(runs)
  return [
    ...stalledPlanetProblems(medians),
    ...medians.flatMap(slowPlanetProblems),
    ...medians.flatMap(shortPlanetProblems),
    ...medians.flatMap(longGapProblems),
    ...medians.flatMap(slowFeltProblems),
    ...medians.flatMap((median, index) => feltRatioProblems(median, medians[index - 1])),
    ...medians.flatMap(purchaseCountProblems),
    ...medians.flatMap(drillTipCadenceProblems),
    ...medians.flatMap(otherSpendProblems),
    ...medians.flatMap(catchUpBurstProblems),
    ...tankEmptyProblems(runs),
  ]
}

function stalledPlanetProblems(medians: readonly PlanetMedians[]): string[] {
  return medians
    .filter((median) => median.minutes === null)
    .map((median) => `planet ${median.planet} core never reached on the median seed (stalled)`)
}

function isTimedPlanet(planet: number): boolean {
  return planet >= DRILL_PACE_BARS.firstTimedPlanet
}

function slowPlanetProblems({ planet, minutes }: PlanetMedians): string[] {
  if (!isTimedPlanet(planet) || minutes === null) return []
  if (minutes <= DRILL_PACE_BARS.planetMinutes.max) return []
  return [`planet ${planet} takes ${minutes.toFixed(1)} min, over 30`]
}

function longGapProblems({ planet, longestGapMinutes: gap }: PlanetMedians): string[] {
  if (!isTimedPlanet(planet) || gap === null || gap <= DRILL_PACE_BARS.drillGapMinutesMax) return []
  return [`planet ${planet} waits ${gap.toFixed(1)} min between two drill purchases, over 10`]
}

function slowFeltProblems({ planet, averageFelt }: PlanetMedians): string[] {
  if (averageFelt === null || averageFelt >= DRILL_PACE_BARS.feltCellsPerSecondMin) return []
  return [`planet ${planet} averages ${averageFelt.toFixed(2)} felt cells/s, under 5`]
}

function tankEmptyProblems(runs: readonly DrillPaceRun[]): string[] {
  return runs.flatMap((run) =>
    [...run.tally.planets.values()]
      .filter((pace) => pace.tankEmpties > 0)
      .map(
        (pace) =>
          `seed ${run.worldSeed} ran the tank dry ${pace.tankEmpties}x on planet ${pace.planet}`,
      ),
  )
}

function shortPlanetProblems({ planet, minutes }: PlanetMedians): string[] {
  if (!isTimedPlanet(planet) || minutes === null) return []
  if (minutes >= DRILL_PACE_BARS.planetMinutes.min) return []
  return [`planet ${planet} takes ${minutes.toFixed(1)} min, under 22`]
}

function purchaseCountProblems({ planet, drillPurchases }: PlanetMedians): string[] {
  const { min, max } = DRILL_PACE_BARS.drillPurchasesPerPlanet
  if (!isTimedPlanet(planet) || drillPurchases === null) return []
  if (drillPurchases >= min && drillPurchases <= max) return []
  return [`planet ${planet} buys ${drillPurchases} drill purchases, outside 3 to 4`]
}

function feltRatioProblems(median: PlanetMedians, before: PlanetMedians | undefined): string[] {
  if (before?.averageFelt == null || median.averageFelt === null || before.averageFelt === 0) {
    return []
  }
  const ratio = median.averageFelt / before.averageFelt
  if (ratio >= DRILL_PACE_BARS.feltRatioToPreviousMin) return []
  return [
    `planet ${median.planet} felt speed ${ratio.toFixed(2)}x planet ${before.planet}'s, under 0.9`,
  ]
}

function drillTipCadenceProblems({ planet, drillTipMajors }: PlanetMedians): string[] {
  const { min, max } = DRILL_PACE_BARS.drillTipMajorsPerPlanet
  if (!isTimedPlanet(planet) || drillTipMajors === null) return []
  if (drillTipMajors >= min && drillTipMajors <= max) return []
  return [`planet ${planet} lands ${drillTipMajors} drill + tip majors, outside 3.5 to 7.0`]
}

function otherSpendProblems({ planet, otherSpendShareWithHullBp: share }: PlanetMedians): string[] {
  const bar = otherSpendBarBpOf(planet)
  if (share === null || share <= bar) return []
  return [`planet ${planet} spends ${share} bp on hold, boiler, engine and hull, bar ${bar} bp`]
}

function otherSpendBarBpOf(planet: number): number {
  const { planet1, later } = DRILL_PACE_BARS.otherSpendShareBpMax
  return planet === 1 ? planet1 : later
}

function catchUpBurstProblems({ planet, catchUpPurchases }: PlanetMedians): string[] {
  if (catchUpPurchases === null || catchUpPurchases <= DRILL_PACE_BARS.catchUpPurchasesMax) {
    return []
  }
  return [`planet ${planet} buys ${catchUpPurchases} hold, boiler and engine steps, over 50`]
}

/** The bars the lane prints and never gates, each as a finding line. */
export function printedDrillPaceFindingsOf(runs: readonly DrillPaceRun[]): string[] {
  const medians = planetMediansOf(runs)
  return [
    ...medians.flatMap(majorsFindings),
    ...medians.flatMap(drillTipAmberFindings),
    ...medians.flatMap(otherSpendWithoutHullFindings),
    ...medians.flatMap(coreFeltFindings),
    ...runs.flatMap(levelMilestoneFindings),
    ...runs.flatMap(amberIncomeFindings),
  ]
}

function majorsFindings({ planet, majors }: PlanetMedians): string[] {
  const { min, max } = DRILL_PACE_BARS.majorsPerPlanet
  if (!isTimedPlanet(planet) || majors === null || (majors >= min && majors <= max)) return []
  return [`planet ${planet} lands ${majors} majors of all tracks, outside 3.5 to 6.0`]
}

function drillTipAmberFindings({ planet, drillTipMajors }: PlanetMedians): string[] {
  if (!isTimedPlanet(planet) || drillTipMajors === null) return []
  if (drillTipMajors !== DRILL_PACE_BARS.drillTipMajorsPerPlanet.amber) return []
  return [`planet ${planet} amber: ${drillTipMajors} drill + tip majors`]
}

function otherSpendWithoutHullFindings({ planet, otherSpendShareBp: share }: PlanetMedians) {
  const bar = otherSpendBarBpOf(planet)
  if (share === null || share <= bar) return []
  return [`planet ${planet} spends ${share} bp on hold, boiler and engine alone, bar ${bar} bp`]
}

function coreFeltFindings({ planet, coreFelt }: PlanetMedians): string[] {
  if (coreFelt === null || coreFelt <= DRILL_PACE_BARS.coreFeltCellsPerSecondMax) return []
  return [`planet ${planet} leaves at ${coreFelt.toFixed(1)} felt cells/s, over 44`]
}

function levelMilestoneFindings({ worldSeed, tally }: DrillPaceRun): string[] {
  const planetOf = (level: number) => tally.purchases.find((row) => row.n === level)?.planet
  const at20 = planetOf(20)
  const at50 = planetOf(50)
  const late20 = at20 === undefined || at20 > DRILL_PACE_BARS.level20ByEndOfPlanet
  const early50 = at50 !== undefined && at50 < DRILL_PACE_BARS.level50NotBeforePlanet
  return [
    ...(late20
      ? [`seed ${worldSeed} reaches drill level 20 on planet ${at20 ?? 'never'}, after P4`]
      : []),
    ...(early50 ? [`seed ${worldSeed} reaches drill level 50 on planet ${at50}, before P5`] : []),
  ]
}

function amberIncomeFindings({ worldSeed, tally }: DrillPaceRun): string[] {
  return amberIncomeGainsOf(incomeGainsOf(tally.purchases)).map(
    ({ n, planet }) =>
      `seed ${worldSeed} amber: drill purchase ${n} on planet ${planet} is the second in a row under +5% income`,
  )
}
