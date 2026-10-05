import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import { derivePacingReport, laterPlanetAlerts, pacingAlerts, pacingProblems } from './pacingReport'
import type { RunEvent } from './runEvent'

const WORLD_SEED = 83921
const SECOND = 60
const MINUTE = 60 * SECOND

let nextSeq = 0

function line<N extends RunEventName>(
  tick: number,
  event: N,
  data: RunEventData<N>,
  planet = 1,
): RunEvent {
  return {
    v: 1,
    seq: nextSeq++,
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

const sale = (tick: number) =>
  line(tick, 'resource_sold', { items: [{ tier: 1, amount: 3 }], value: '3e+1', mode: 'all' })

const upgrade = (tick: number, upgradeId: string, toLevel: number) =>
  line(tick, 'upgrade_purchased', {
    upgradeId,
    kind: 'vertical',
    fromLevel: toLevel - 1,
    toLevel,
    cost: '2.4e+1',
    costCurveId: `cost.vehicle.${upgradeId}`,
    totalLevel: toLevel,
    visualTier: 1,
    statsAfter: {},
  })

/** A band-2 tile on planet 1 of the seed (#4 thresholds: band 2 starts 8% below the surface). */
const band2Tile = (tick: number) => line(tick, 'tile_destroyed', { tx: 7, ty: 270, kind: 'ground' })

const onTimeRun = (): RunEvent[] => [
  line(0, 'planet_entered', { planetSeed: 1, generatorVersion: 1, radius: 300 }),
  line(10 * SECOND, 'dock_left', { durationTicks: 0 }),
  sale(60 * SECOND),
  upgrade(60 * SECOND, 'drill_tip', 1),
  upgrade(200 * SECOND, 'hull', 1),
  upgrade(300 * SECOND, 'drill_tip', 2),
  band2Tile(400 * SECOND),
  line(45 * MINUTE, 'core_completed', { durationTicks: 0 }),
  line(50 * MINUTE, 'planet_entered', { planetSeed: 2, generatorVersion: 1, radius: 400 }, 2),
  line(100 * MINUTE, 'core_completed', { durationTicks: 0 }, 2),
  line(100 * MINUTE, 'rescue_triggered', {
    cause: 'destroyed',
    fee: '0e+0',
    cargoLostValue: '0e+0',
  }),
]

describe('pacing report', () => {
  it('passes a run that meets every target', () => {
    expect(pacingProblems(derivePacingReport(onTimeRun(), WORLD_SEED))).toEqual([])
  })

  it('times each core from the arrival on its planet, and the slice from the start', () => {
    const report = derivePacingReport(onTimeRun(), WORLD_SEED)
    expect(report.coreTicksOnPlanet).toEqual({ '1': 45 * MINUTE, '2': 50 * MINUTE })
    expect(report.sliceEndTick).toBe(100 * MINUTE)
  })

  it('names a first sale later than 120 s', () => {
    const late = onTimeRun().map((event) =>
      event.event === 'resource_sold' ? sale(130 * SECOND) : event,
    )
    expect(pacingProblems(derivePacingReport(late, WORLD_SEED))).toEqual([
      'first sale at 130.0 s, target within 120 s',
    ])
  })

  it('names a slice that never ends', () => {
    const unfinished = onTimeRun().filter((event) => event.planet === 1)
    expect(pacingProblems(derivePacingReport(unfinished, WORLD_SEED))).toEqual([
      'slice at 45.0 min, target 90 to 130 min',
    ])
  })

  it('counts the ten-minute beats: upgrades, tracks and the deepest band', () => {
    const report = derivePacingReport(onTimeRun(), WORLD_SEED)
    expect(report).toMatchObject({
      upgradesByEarlyCheck: 3,
      tracksByEarlyCheck: 2,
      deepestBandByEarlyCheck: 2,
    })
  })

  it('keeps the final level of every track and the rescues by cause', () => {
    const report = derivePacingReport(onTimeRun(), WORLD_SEED)
    expect(report.finalLevels).toMatchObject({ drill_tip: 2, hull: 1, engine: 0 })
    expect(report.rescuesByCause).toEqual({ destroyed: 1 })
  })

  it('reports a later planet whose core leaves 25 to 120 minutes, never the slice planets', () => {
    const run = [
      ...onTimeRun(),
      line(100 * MINUTE, 'planet_entered', { planetSeed: 3, generatorVersion: 1, radius: 475 }, 3),
      line(240 * MINUTE, 'core_completed', { durationTicks: 0 }, 3),
    ]
    expect(laterPlanetAlerts(derivePacingReport(run, WORLD_SEED))).toEqual([
      'planet 3 core took 140.0 min, expected 25 to 120 min; retune paceScale(3)',
    ])
  })

  it('alerts, without failing, on a planet done in fewer than 3 trips', () => {
    const report = derivePacingReport(onTimeRun(), WORLD_SEED)
    expect(pacingAlerts(report)).toEqual(['planet 1 took 1 trips, expected 3 to 12'])
  })
})
