/**
 * The greedy rush bot's pace asserts (the Vertical Scaler's point 2 on #411, from the #304
 * Revision 2 growth asserts, section 4 (d), and the 0.98x regression gate): on the median of the
 * pacing seeds, a rush run plays planet 1 in 15 to 30 minutes and every later planet in at least
 * 22, arrival to core, and reaches each planet's core no sooner than 0.98 of the plain pacing
 * bot's time on the same seed. A skip that beats the curve is a pricing bug, never a reason to
 * slow the bot. A core never completed is "never": it fails the floors and the gate.
 *
 * Felt drill speed is judged per planet on the plain bot by #551's bars (ticket 552,
 * `logging/drillPace.lane.test.ts`), which supersede #304 section 4 (a) to (c) for drill power.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { medianTicks, minutesOfTicks, planetCoreTicksOf, type ForkPaceTally } from './forkPace'

export const RUSH_PACE_PINS = {
  lastPlanet: 10,
  firstPlanetMinutes: { min: 15, max: 30 },
  planetMinutesFloor: 22,
  /** The rush's time to each core, in basis points of the plain bot's. */
  timeToCoreFloorBp: 9800,
} as const

const FIRST_PLANET = 1
const TICKS_PER_MINUTE = 60 * TICKS_PER_SECOND
const WHOLE_BP = 10_000

/** One seed played twice: by the plain pacing bot and with the rush hand. */
export interface RushSeedRun {
  worldSeed: number
  plain: ForkPaceTally
  rush: ForkPaceTally
}

/** Every way the rush runs miss the pins; empty when they hold. */
export function rushPaceProblems(runs: readonly RushSeedRun[]): string[] {
  return [
    ...unfinishedSeedProblems(runs),
    ...firstPlanetProblems(runs),
    ...planetFloorProblems(runs),
    ...timeToCoreProblems(runs),
  ]
}

function unfinishedSeedProblems(runs: readonly RushSeedRun[]): string[] {
  return runs
    .filter((run) => !run.rush.coreTick.has(RUSH_PACE_PINS.lastPlanet))
    .map(
      (run) =>
        `seed ${run.worldSeed}: the rush never completed planet ${RUSH_PACE_PINS.lastPlanet}'s core`,
    )
}

function firstPlanetProblems(runs: readonly RushSeedRun[]): string[] {
  const ticks = medianPlanetTicksOf(runs, FIRST_PLANET)
  const { min, max } = RUSH_PACE_PINS.firstPlanetMinutes
  if (isAtLeastMinutes(ticks, min) && isAtMostMinutes(ticks, max)) return []
  return [`planet 1 took ${minutesOfTicks(ticks)} min on the rush median, outside ${min} to ${max}`]
}

function planetFloorProblems(runs: readonly RushSeedRun[]): string[] {
  return laterPlanets().flatMap((planet) => {
    const ticks = medianPlanetTicksOf(runs, planet)
    const floor = RUSH_PACE_PINS.planetMinutesFloor
    if (isAtLeastMinutes(ticks, floor)) return []
    return [`planet ${planet} took ${minutesOfTicks(ticks)} min on the rush median, under ${floor}`]
  })
}

function timeToCoreProblems(runs: readonly RushSeedRun[]): string[] {
  return planetsThroughLast().flatMap((planet) => {
    const rush = medianTicks(runs.map((run) => run.rush.coreTick.get(planet) ?? null))
    const plain = medianTicks(runs.map((run) => run.plain.coreTick.get(planet) ?? null))
    if (isAtLeastFloorOf(rush, plain)) return []
    return [
      `planet ${planet}'s core at ${minutesOfTicks(rush)} min on the rush median, under 0.98x the plain bot's ${minutesOfTicks(plain)}`,
    ]
  })
}

/** The rush at least the floor's share of the plain bot's time; a plain never judges nothing. */
function isAtLeastFloorOf(rush: number | null, plain: number | null): boolean {
  if (plain === null) return true
  return rush !== null && rush * WHOLE_BP >= plain * RUSH_PACE_PINS.timeToCoreFloorBp
}

function medianPlanetTicksOf(runs: readonly RushSeedRun[], planet: number): number | null {
  return medianTicks(runs.map((run) => planetCoreTicksOf(run.rush, planet)))
}

function laterPlanets(): number[] {
  return planetsThroughLast().filter((planet) => planet > FIRST_PLANET)
}

function planetsThroughLast(): number[] {
  return Array.from({ length: RUSH_PACE_PINS.lastPlanet }, (_, index) => index + FIRST_PLANET)
}

function isAtLeastMinutes(ticks: number | null, minutes: number): boolean {
  return ticks !== null && ticks >= minutes * TICKS_PER_MINUTE
}

function isAtMostMinutes(ticks: number | null, minutes: number): boolean {
  return ticks !== null && ticks <= minutes * TICKS_PER_MINUTE
}
