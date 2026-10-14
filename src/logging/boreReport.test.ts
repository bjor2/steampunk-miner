import { describe, expect, it } from 'vitest'
import { LOCKED_SCHEDULE } from '../systems/unlocks/unlockSchedule'
import {
  deriveBoreReport,
  formatBoreReport,
  FORCED_SHOTS_MIN,
  type BorePolicyRun,
  type BoreSeedRuns,
} from './boreReport'
import type { RunEventData, RunEventName } from './eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

const MINUTE = 60 * 60
const LAST_PLANET = 2
const SEED = 83921

/** One planet of a made-up run: its core minutes, the drill it leaves with and the shots fired. */
interface PlanetPlay {
  coreMinutes: number
  drillOnLeaving: number
  shots: number
}

function line<N extends RunEventName>(
  event: N,
  data: RunEventData<N>,
  planet: number,
  tick: number,
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: 0,
    tick,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet,
    depthTiles: 0,
    event,
    data,
  } as RunEvent
}

/** A run that plays `plays` planet after planet, each in its core minutes, and travels on. */
function runOf(plays: readonly PlanetPlay[]): BorePolicyRun {
  let tick = 0
  const events = plays.flatMap((play, at) => {
    const planet = at + 1
    const arrival = tick
    tick += play.coreMinutes * MINUTE
    return planetLinesOf(planet, play, arrival, tick)
  })
  return { events, isFinished: true }
}

function planetLinesOf(planet: number, play: PlanetPlay, arrival: number, core: number) {
  return [
    line('planet_entered', { planetSeed: 1, generatorVersion: 5, radius: 676 }, planet, arrival),
    ...Array.from({ length: play.shots }, () =>
      line('bore_fired', { aimed: 170, bearing: 170, rangeCells: 4 }, planet, arrival + 1),
    ),
    line(
      'upgrade_purchased',
      {
        upgradeId: 'drill_power',
        fromLevel: play.drillOnLeaving - 1,
        toLevel: play.drillOnLeaving,
        cost: '1',
        kind: 'geometric',
        costCurveId: 'cost.vehicle.drill_power',
        totalLevel: play.drillOnLeaving,
        visualTier: 1,
        statsAfter: {},
      },
      planet,
      arrival + 2,
    ),
    line('core_completed', { durationTicks: 1 }, planet, core),
    line(
      'travel_started',
      { fromPlanet: planet, toPlanet: planet + 1, cost: '1', coreSpent: 1 },
      planet,
      core,
    ),
  ]
}

const NEVER: PlanetPlay[] = [
  { coreMinutes: 50, drillOnLeaving: 5, shots: 0 },
  { coreMinutes: 60, drillOnLeaving: 9, shots: 0 },
]

/** The forced run on the never run's plays, with `change` made to every planet. */
function forcedLike(change: Partial<PlanetPlay>): PlanetPlay[] {
  return NEVER.map((play) => ({ ...play, shots: FORCED_SHOTS_MIN, ...change }))
}

function seedOf(forced: readonly PlanetPlay[], never: readonly PlanetPlay[] = NEVER): BoreSeedRuns {
  return { worldSeed: SEED, never: runOf(never), forced: runOf(forced) }
}

/** The misses the bore pins list, without the campaign gate's own (its sawtooth needs real runs). */
function pinMissesOf(seed: BoreSeedRuns): string[] {
  return deriveBoreReport([seed], LOCKED_SCHEDULE, LAST_PLANET).problems.filter(
    (problem) => !problem.startsWith('forced run, campaign scaling gate'),
  )
}

describe('bore report (ticket 347)', () => {
  it('lists no miss when the forced run takes as long, leaves with the same drill and fires 60 shots a planet', () => {
    expect(pinMissesOf(seedOf(forcedLike({})))).toEqual([])
  })

  it('accepts a forced core at exactly 0.98x the never run, and refuses one just under it', () => {
    const atPin = forcedLike({})
    atPin[0] = { ...atPin[0], coreMinutes: 49 }
    expect(pinMissesOf(seedOf(atPin))).toEqual([])
    const under = forcedLike({})
    under[1] = { ...under[1], coreMinutes: 58 }
    expect(pinMissesOf(seedOf(under))).toEqual([
      `seed ${SEED} planet 2: the forced run reached the core in 96.7% of the never run's time, under 98.0%`,
    ])
  })

  it('accepts departure drill_power one level off the never run, and refuses two', () => {
    const plays = forcedLike({})
    plays[0] = { ...plays[0], drillOnLeaving: 6 }
    plays[1] = { ...plays[1], drillOnLeaving: 11 }
    expect(pinMissesOf(seedOf(plays))).toEqual([
      `seed ${SEED} planet 2: the forced run left with drill_power 11, the never run 9; at most 1 apart`,
    ])
  })

  it('refuses a forced run that fired under 60 shots', () => {
    const plays = forcedLike({ shots: 0 })
    plays[0] = { ...plays[0], shots: FORCED_SHOTS_MIN - 1 }
    expect(pinMissesOf(seedOf(plays))).toEqual([
      `seed ${SEED}: the forced run fired ${FORCED_SHOTS_MIN - 1} shots, under ${FORCED_SHOTS_MIN}`,
    ])
  })

  it('lists a planet the forced run never cored', () => {
    const seed = seedOf(forcedLike({}).slice(0, 1))
    expect(pinMissesOf(seed)).toContain(
      `seed ${SEED} planet 2: the forced run did not reach the core`,
    )
  })

  it('holds the forced run to the campaign scaling gate', () => {
    const stalled = {
      ...seedOf(forcedLike({})),
      forced: { ...runOf(forcedLike({})), isFinished: false },
    }
    const problems = deriveBoreReport([stalled], LOCKED_SCHEDULE, LAST_PLANET).problems
    expect(problems).toContain(
      `forced run, campaign scaling gate: seed ${SEED} stalled on planet 2 before the core of planet ${LAST_PLANET}`,
    )
  })

  it('prints a row per seed and planet with the shots fired there', () => {
    const report = deriveBoreReport([seedOf(forcedLike({}))], LOCKED_SCHEDULE, LAST_PLANET)
    expect(report.lines.map(({ planet, forcedShots }) => ({ planet, forcedShots }))).toEqual([
      { planet: 1, forcedShots: FORCED_SHOTS_MIN },
      { planet: 2, forcedShots: FORCED_SHOTS_MIN },
    ])
    expect(formatBoreReport(report)).toContain(
      `| ${SEED} | 1 | 50.0 min | 50.0 min | 100.0% | 5 | 5 | ${FORCED_SHOTS_MIN} |`,
    )
  })
})
