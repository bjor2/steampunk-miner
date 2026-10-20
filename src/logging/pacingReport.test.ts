import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import {
  campaignPlanetAlerts,
  derivePacingReport,
  formatPacingVerdicts,
  laterPlanetAlerts,
  pacingAlerts,
  pacingProblems,
  pacingVerdicts,
} from './pacingReport'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

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
    v: LOG_SCHEMA_VERSION,
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
  line(tick, 'resource_sold', {
    items: [{ tier: 1, amount: 3 }],
    value: '3e+1',
    mode: 'all',
    coinsShown: 7,
  })

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

/** An event stamped below the surface: the vehicle is out on a dive. */
const underground = (event: RunEvent): RunEvent => ({ ...event, depthTiles: 30 })

const dockEntry = (tick: number, bay: 'sell' | 'upgrade') =>
  line(tick, 'dock_entered', { bay, cargoUnits: 0, energy: 0, hull: '1e+2' })

const dockExit = (tick: number, bay: 'sell' | 'upgrade') =>
  line(tick, 'dock_left', { bay, durationTicks: 0 })

/** A band-2 tile on planet 1 of the seed (#4 thresholds: band 2 starts 8% below the surface). */
const band2Tile = (tick: number) => line(tick, 'tile_destroyed', { tx: 7, ty: 270, kind: 'ground' })

const onTimeRun = (): RunEvent[] => [
  line(0, 'planet_entered', { planetSeed: 1, generatorVersion: 1, radius: 300 }),
  dockExit(10 * SECOND, 'sell'),
  underground(line(30 * SECOND, 'tile_destroyed', { tx: 7, ty: 290, kind: 'ground' })),
  dockEntry(50 * SECOND, 'sell'),
  sale(60 * SECOND),
  upgrade(60 * SECOND, 'drill_tip', 1),
  upgrade(200 * SECOND, 'hull', 1),
  upgrade(300 * SECOND, 'drill_tip', 2),
  band2Tile(400 * SECOND),
  line(25 * MINUTE, 'core_completed', { durationTicks: 0 }),
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
    expect(report.coreTicksOnPlanet).toEqual({ '1': 25 * MINUTE, '2': 50 * MINUTE })
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
      'slice at 25.0 min, target 40 to 130 min',
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

  it("reads the deepest early band off a drill span's first cell (ticket 420)", () => {
    const span = line(5 * MINUTE, 'drill_cut', {
      spans: 4,
      cells: 9,
      first: [7, 270],
      last: [7, 262],
      ticks: 40,
      units: 0,
      value: '0e+0',
      ores: [],
      energy: 0,
      heat: 0,
      stop: 'command',
    })
    const run = onTimeRun().filter((event) => event.event !== 'tile_destroyed')
    expect(derivePacingReport([...run, span], WORLD_SEED).deepestBandByEarlyCheck).toBe(2)
    expect(derivePacingReport(run, WORLD_SEED).deepestBandByEarlyCheck).toBe(0)
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

  it('reports every campaign planet whose core leaves 45 to 60 minutes from arrival', () => {
    const run = [
      ...onTimeRun(),
      line(100 * MINUTE, 'planet_entered', { planetSeed: 3, generatorVersion: 1, radius: 475 }, 3),
      line(150 * MINUTE, 'core_completed', { durationTicks: 0 }, 3),
      line(160 * MINUTE, 'planet_entered', { planetSeed: 4, generatorVersion: 1, radius: 500 }, 4),
      line(240 * MINUTE, 'core_completed', { durationTicks: 0 }, 4),
    ]
    expect(campaignPlanetAlerts(derivePacingReport(run, WORLD_SEED))).toEqual([
      'planet 1 core took 25.0 min, campaign target 45 to 60 min per planet',
      'planet 4 core took 80.0 min, campaign target 45 to 60 min per planet',
    ])
  })

  it('reports a slice planet off the campaign target without failing the slice gates', () => {
    const report = derivePacingReport(onTimeRun(), WORLD_SEED)
    expect(campaignPlanetAlerts(report)).toEqual([
      'planet 1 core took 25.0 min, campaign target 45 to 60 min per planet',
    ])
    expect(pacingProblems(report)).toEqual([])
  })

  it('alerts, without failing, on a planet done in fewer than 3 trips', () => {
    const report = derivePacingReport(onTimeRun(), WORLD_SEED)
    expect(pacingAlerts(report)).toEqual(['planet 1 took 1 trips, expected 3 to 12'])
  })

  it('counts one trip for a surface visit that docks at the Sell bay and then the Works', () => {
    const run = [
      underground(band2Tile(30 * SECOND)),
      dockEntry(60 * SECOND, 'sell'),
      dockExit(70 * SECOND, 'sell'),
      dockEntry(80 * SECOND, 'upgrade'),
      dockExit(90 * SECOND, 'upgrade'),
    ]
    expect(derivePacingReport(run, WORLD_SEED).tripsByPlanet).toEqual({ '1': 1 })
  })

  it('counts a trip per dive below the surface, on the planet the vehicle docks at', () => {
    const run = [
      underground(band2Tile(30 * SECOND)),
      dockEntry(60 * SECOND, 'sell'),
      dockExit(70 * SECOND, 'sell'),
      underground(band2Tile(100 * SECOND)),
      dockEntry(130 * SECOND, 'upgrade'),
      dockExit(140 * SECOND, 'upgrade'),
      underground(line(200 * SECOND, 'tile_destroyed', { tx: 7, ty: 390, kind: 'ground' }, 2)),
      line(
        230 * SECOND,
        'dock_entered',
        { bay: 'sell', cargoUnits: 0, energy: 0, hull: '1e+2' },
        2,
      ),
    ]
    expect(derivePacingReport(run, WORLD_SEED).tripsByPlanet).toEqual({ '1': 2, '2': 1 })
  })

  it('counts no trip for docking that never left the surface', () => {
    const run = [dockEntry(5 * SECOND, 'sell'), dockExit(10 * SECOND, 'sell')]
    expect(derivePacingReport(run, WORLD_SEED).tripsByPlanet).toEqual({})
  })

  it('passes each of the three gates for a run that meets every target', () => {
    const verdicts = pacingVerdicts(derivePacingReport(onTimeRun(), WORLD_SEED))
    expect(verdicts.map((verdict) => verdict.gate)).toEqual([
      'first ten minutes (#16)',
      'planet 1 core, 15 to 30 min',
      'slice, 40 to 130 min',
    ])
    expect(formatPacingVerdicts(verdicts)).not.toContain('FAIL')
  })

  it('fails only the slice gate for a slice that ends too early, naming the miss', () => {
    const early = onTimeRun().map((event) =>
      event.planet === 2 && event.event === 'core_completed'
        ? line(35 * MINUTE, 'core_completed', { durationTicks: 0 }, 2)
        : event,
    )
    const table = formatPacingVerdicts(pacingVerdicts(derivePacingReport(early, WORLD_SEED)))
    expect(table).toContain(
      '| slice, 40 to 130 min | FAIL: slice at 35.0 min, target 40 to 130 min |',
    )
    expect(table.match(/FAIL/g)).toHaveLength(1)
  })
})
