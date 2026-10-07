import { describe, expect, it } from 'vitest'
import {
  attritionFindings,
  attritionMedians,
  attritionRows,
  formatAttritionTables,
  type SeededRunEvents,
} from './attritionReport'
import type { RunEventData, RunEventName } from './eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

const MINUTE = 60 * 60

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

interface PlanetPlay {
  planet: number
  arrivedMinute: number
  /** Null for a core the run never completed. */
  coreMinutes: number | null
  trips: number
  deaths: number
}

function playedOn({ planet, arrivedMinute, coreMinutes, trips, deaths }: PlanetPlay): RunEvent[] {
  const arrived = arrivedMinute * MINUTE
  const entered = { planetSeed: 1, generatorVersion: 5, radius: 700 }
  const destroyed = { cause: 'enemy', kind: 'crawler', tier: 9, arc: 'front' }
  return [
    line('planet_entered', entered, planet, arrived),
    ...Array.from({ length: trips }, () =>
      line('dock_left', { bay: 'sell', durationTicks: 1 }, planet, arrived),
    ),
    ...Array.from({ length: deaths }, () => line('vehicle_destroyed', destroyed, planet, arrived)),
    ...(coreMinutes === null
      ? []
      : [line('core_completed', { durationTicks: 1 }, planet, arrived + coreMinutes * MINUTE)]),
  ]
}

/** A seed that plays P8 to P10 at the given core minutes, trips and deaths. */
function seedRun(worldSeed: number, plays: readonly Omit<PlanetPlay, 'arrivedMinute'>[]) {
  const events = plays.flatMap((play, at) => playedOn({ ...play, arrivedMinute: at * 100 }))
  return { worldSeed, events } satisfies SeededRunEvents
}

const CLEAN = seedRun(31415, [
  { planet: 8, coreMinutes: 50, trips: 20, deaths: 1 },
  { planet: 9, coreMinutes: 34, trips: 17, deaths: 1 },
  { planet: 10, coreMinutes: 52, trips: 20, deaths: 2 },
])
const ALSO_CLEAN = seedRun(27182, [
  { planet: 8, coreMinutes: 47, trips: 22, deaths: 1 },
  { planet: 9, coreMinutes: 40, trips: 20, deaths: 2 },
  { planet: 10, coreMinutes: 55, trips: 20, deaths: 2 },
])

describe('attrition report (#198 acceptance)', () => {
  it('prints core minutes, trips and deaths per trip for every seed on planets 8 to 10', () => {
    const rows = attritionRows([CLEAN])
    expect(rows.map((row) => row.planet)).toEqual([8, 9, 10])
    expect(rows[1]).toMatchObject({ worldSeed: 31415, coreMinutes: 34, trips: 17, deaths: 1 })
    expect(rows[2].deathsPerTrip).toBe(0.1)
  })

  it('finds nothing when every seed plays the attrition planets cleanly', () => {
    const looping = seedRun(83921, [
      { planet: 8, coreMinutes: 46, trips: 23, deaths: 0 },
      { planet: 9, coreMinutes: 60, trips: 30, deaths: 7 },
      { planet: 10, coreMinutes: 50, trips: 25, deaths: 2 },
    ])
    const rows = attritionRows([looping, CLEAN, ALSO_CLEAN])
    const medians = attritionMedians(rows)
    expect(medians[1].deathsPerTrip).toBe(0.1)
    expect(attritionFindings(rows, medians)).toEqual([])
  })

  it('finds a seed above a quarter of a death a trip even when the median holds', () => {
    const looping = seedRun(83921, [
      { planet: 8, coreMinutes: 46, trips: 23, deaths: 0 },
      { planet: 9, coreMinutes: 144, trips: 26, deaths: 14 },
      { planet: 10, coreMinutes: 50, trips: 25, deaths: 2 },
    ])
    const rows = attritionRows([looping, CLEAN, ALSO_CLEAN])
    expect(attritionFindings(rows, attritionMedians(rows))).toEqual([
      'seed 83921 has 0.54 deaths per trip on planet 9, above 0.25',
    ])
  })

  it('finds a stalled seed and the median core it leaves short', () => {
    const stalled = seedRun(83921, [
      { planet: 8, coreMinutes: 46, trips: 23, deaths: 0 },
      { planet: 9, coreMinutes: null, trips: 12, deaths: 2 },
      { planet: 10, coreMinutes: null, trips: 0, deaths: 0 },
    ])
    const rows = attritionRows([stalled, CLEAN, ALSO_CLEAN])
    const findings = attritionFindings(rows, attritionMedians(rows))
    expect(findings).toContain("seed 83921 never completed planet 9's core")
    expect(findings).toContain("seed 83921 never completed planet 10's core")
  })

  it('holds planet 9 to its 30-minute floor and planets 8 and 10 to 45 to 60 minutes', () => {
    const quick = seedRun(83921, [
      { planet: 8, coreMinutes: 40, trips: 20, deaths: 0 },
      { planet: 9, coreMinutes: 25, trips: 15, deaths: 0 },
      { planet: 10, coreMinutes: 61, trips: 20, deaths: 0 },
    ])
    const rows = attritionRows([quick, quick, quick])
    expect(attritionFindings(rows, attritionMedians(rows))).toEqual([
      "planet 8's median core time 40.0 min misses its target",
      "planet 9's median core time 25.0 min misses its target",
      "planet 10's median core time 61.0 min misses its target",
    ])
  })

  it('formats a row per planet and seed, then a median row per planet', () => {
    const rows = attritionRows([CLEAN, ALSO_CLEAN])
    const text = formatAttritionTables(rows, attritionMedians(rows))
    expect(text).toContain('| 9 | 31415 | 34.0 min | 17 | 1 | 0.06 |')
    expect(text).toContain('| 10 | 55.0 min | 0.10 | 0.10 |')
  })
})
