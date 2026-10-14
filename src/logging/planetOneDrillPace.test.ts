import { describe, expect, it } from 'vitest'
import { drillPower } from '../systems/economy/vehicleStats'
import { toFixedText } from '../systems/money'
import { bandOfTile } from '../systems/world/planetGeometry'
import { planetParamsFor } from '../systems/world/planetParams'
import type { RunEventData, RunEventName } from './eventNames'
import {
  bandOneCellsPerSecond,
  derivePlanetOneDrillPace,
  medianPlanetOneDrillPace,
  planetOneDrillPaceProblems,
  type PlanetOneDrillPace,
} from './planetOneDrillPace'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

const WORLD_SEED = 83921
const MAJOR = 10

function line<N extends RunEventName>(
  tick: number,
  event: N,
  data: RunEventData<N>,
  planet = 1,
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: tick,
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

const drillBuy = (tick: number, toMajor: number) =>
  line(tick, 'upgrade_purchased', {
    upgradeId: 'drill_power',
    kind: 'vertical',
    fromLevel: toMajor * MAJOR - 1,
    toLevel: toMajor * MAJOR,
    cost: '1e+1',
    costCurveId: 'cost.vehicle.drill_power',
    totalLevel: toMajor * MAJOR,
    visualTier: 1,
    statsAfter: {},
  })

/** A tile straight down the planet 1 column, in `band`. */
function tileInBand(tick: number, band: number): RunEvent {
  const params = planetParamsFor(WORLD_SEED, 1)
  let ty = params.radiusTiles - 1
  while (bandOfTile(params, 0, ty) < band) ty -= 1
  return line(tick, 'tile_destroyed', { tx: 0, ty, kind: 'ground' })
}

const arriveOnPlanetTwo = (tick: number) =>
  line(tick, 'planet_entered', { planetSeed: 2, generatorVersion: 1, radius: 400 }, 2)

function paceOf(
  start: number,
  bandThree: number | null,
  departure: number | null,
): PlanetOneDrillPace {
  return {
    startCellsPerSecond: start,
    bandThreeCellsPerSecond: bandThree,
    departureCellsPerSecond: departure,
  }
}

describe('planet 1 drill pace (ticket 396)', () => {
  it('reads band 1 of planet 1 at the drill power of the major, 1.5 cells/s at the start', () => {
    expect(bandOneCellsPerSecond(levelsWithDrillMajor(0))).toBe(1.5)
    expect(bandOneCellsPerSecond(levelsWithDrillMajor(10))).toBeCloseTo(
      Number(toFixedText(drillPower(10), 6)),
      1,
    )
  })

  it('takes the speed at the first band-3 tile of planet 1 and on arriving at planet 2', () => {
    const pace = derivePlanetOneDrillPace(
      [
        drillBuy(10, 4),
        tileInBand(20, 2),
        drillBuy(30, 10),
        tileInBand(40, 3),
        drillBuy(50, 12),
        tileInBand(60, 3),
        drillBuy(70, 17),
        arriveOnPlanetTwo(80),
        drillBuy(90, 20),
      ],
      WORLD_SEED,
    )
    expect(pace).toEqual(
      paceOf(
        1.5,
        bandOneCellsPerSecond(levelsWithDrillMajor(10)),
        bandOneCellsPerSecond(levelsWithDrillMajor(17)),
      ),
    )
  })

  it('leaves both speeds open for a run that never dug to band 3 or left planet 1', () => {
    expect(derivePlanetOneDrillPace([drillBuy(10, 3), tileInBand(20, 2)], WORLD_SEED)).toEqual(
      paceOf(1.5, null, null),
    )
  })

  it('passes 3x the start by band 3 and 10 cells/s on leaving, and names each miss', () => {
    expect(planetOneDrillPaceProblems(paceOf(1.5, 4.5, 10))).toEqual([])
    expect(planetOneDrillPaceProblems(paceOf(1.5, 4.4, 9.9))).toEqual([
      'planet 1 band 3 reached at 4.40 band-1 cells/s, target at least 3x the start (4.50)',
      'planet 1 left at 9.90 band-1 cells/s, target at least 10',
    ])
    expect(planetOneDrillPaceProblems(paceOf(1.5, null, null))).toEqual([
      'planet 1 band 3 never reached',
      'planet 1 never left',
    ])
  })

  it('takes the middle seed on each speed, a seed that never got there counting slowest', () => {
    const median = medianPlanetOneDrillPace([
      paceOf(1.5, 6, null),
      paceOf(1.5, 4, 12),
      paceOf(1.5, 5, 11),
    ])
    expect(median).toEqual(paceOf(1.5, 5, 11))
    expect(medianPlanetOneDrillPace([paceOf(1.5, null, 12), paceOf(1.5, null, 10)])).toEqual(
      paceOf(1.5, null, 10),
    )
  })
})

function levelsWithDrillMajor(major: number) {
  return {
    drill_power: major * MAJOR,
    drill_tip: 0,
    engine: 0,
    boiler: 0,
    cargo_hold: 0,
    hull: 0,
  }
}
