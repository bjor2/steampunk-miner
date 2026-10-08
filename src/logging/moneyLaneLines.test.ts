import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../constants/physics'
import type { RunEvent } from './runEvent'
import { createRunLog, type RunLog } from './runLog'
import { moneyLaneNdjsonOf, startMoneyLaneFold, type MoneyLaneFold } from './moneyLaneLines'

const MINUTE = 60 * TICKS_PER_SECOND

function laneRun(): { fold: MoneyLaneFold; log: RunLog } {
  const fold = startMoneyLaneFold()
  const log = createRunLog({
    runId: 'run_lane',
    sink: { append: fold.add, appendCommand: () => undefined },
    secondsSinceStart: () => 0,
  })
  return { fold, log }
}

function at(planet: number, tick: number) {
  return { playerId: 'p1', planet, depthTiles: 0, tick }
}

const ENTERED = { planetSeed: 1, generatorVersion: 1, radius: 100 }

function buyDrill(log: RunLog, planet: number, tick: number, toLevel: number, cost: string): void {
  log.record(at(planet, tick), 'upgrade_purchased', {
    upgradeId: 'drill_power',
    fromLevel: toLevel - 1,
    toLevel,
    cost,
    kind: 'level',
    costCurveId: 'drill_power',
    totalLevel: toLevel,
    visualTier: 1,
    statsAfter: { drill_power: '2.5e+105' },
  })
}

/** Planet 1 for 10 minutes (2 docked, 3 cutting), then planet 2 until tick 25 minutes. */
function playTwoPlanets(log: RunLog): void {
  log.record(at(1, 0), 'planet_entered', ENTERED)
  log.record(at(1, MINUTE), 'resource_sold', {
    items: [{ tier: 1, amount: 3 }],
    value: '4.5e+103',
    mode: 'all',
    coinsShown: 3,
  })
  log.record(at(1, 2 * MINUTE), 'dock_left', { bay: 'sell', durationTicks: 2 * MINUTE })
  log.record(at(1, 5 * MINUTE), 'drill_damage_dealt', {
    tx: 0,
    ty: 0,
    ticks: 3 * MINUTE,
    damage: '-7e+2',
  })
  buyDrill(log, 1, 6 * MINUTE, 4, '1.2345e+104')
  log.record(at(1, 10 * MINUTE), 'travel_started', {
    fromPlanet: 1,
    toPlanet: 2,
    cost: '3e+101',
    coreSpent: 0,
  })
  log.record(at(2, 10 * MINUTE), 'planet_entered', ENTERED)
  log.record(at(2, 25 * MINUTE), 'game_ended', { reason: 'slice_completed' })
}

describe('money lane: one summary line per planet', () => {
  it('gives each planet its time on it, the docked and cutting time and the trip share', () => {
    const { fold, log } = laneRun()
    playTwoPlanets(log)
    const [first, second] = fold.summarize().lines
    expect(first).toMatchObject({
      planet: 1,
      ticksOnPlanet: 10 * MINUTE,
      minutesOnPlanet: '10.0',
      dockedTicks: 2 * MINUTE,
      cuttingTicks: 3 * MINUTE,
      tripShareBp: 5000,
    })
    expect(second).toMatchObject({ planet: 2, ticksOnPlanet: 15 * MINUTE, tripShareBp: 10_000 })
  })

  it('keeps the drill levels each planet was entered and left with', () => {
    const { fold, log } = laneRun()
    playTwoPlanets(log)
    const [first, second] = fold.summarize().lines
    expect(first.levels.arrival).toEqual({ drill_power: 0, drill_tip: 0 })
    expect(first.levels.departure).toEqual({ drill_power: 4, drill_tip: 0 })
    expect(second.levels.arrival).toEqual({ drill_power: 4, drill_tip: 0 })
    expect(first.digTicksPerMetre.arrival).toHaveLength(5)
  })

  it('names the largest price, income and amount of each planet as canonical text', () => {
    const { fold, log } = laneRun()
    playTwoPlanets(log)
    const summary = fold.summarize()
    expect(summary.lines[0]).toMatchObject({
      largestPrice: '1.2345e+104',
      largestIncome: '4.5e+103',
      largestMoney: '2.5e+105',
      largestMoneyDigits: 2,
    })
    expect(summary.largestPrice).toBe('1.2345e+104')
    expect(summary.largestIncome).toBe('4.5e+103')
    expect(summary.lines[1].largestMoney).toBe('0e+0')
  })

  it('reads a negative amount by its magnitude', () => {
    const { fold, log } = laneRun()
    log.record(at(1, 0), 'drill_damage_dealt', { tx: 0, ty: 0, ticks: 1, damage: '-7e+2' })
    expect(fold.summarize().lines[0].largestMoney).toBe('7e+2')
  })

  it('lists a money field that is not its canonical string as a problem', () => {
    const fold = startMoneyLaneFold()
    fold.add({
      v: 4,
      seq: 0,
      timestamp: 0,
      runId: 'run_lane',
      ...at(1, 0),
      event: 'travel_started',
      data: { fromPlanet: 1, toPlanet: 2, cost: '1.50', coreSpent: 0 },
    } as RunEvent)
    const summary = fold.summarize()
    expect(summary.problemCount).toBe(1)
    expect(summary.problems[0]).toMatch(/seq 0: .*cost/)
  })

  it('finds no problem in lines the run log stamps from canonical money', () => {
    const { fold, log } = laneRun()
    playTwoPlanets(log)
    expect(fold.summarize().problems).toEqual([])
  })
})

describe('money lane: the summary log', () => {
  it('writes the run and its largest amounts first, then one line a planet', () => {
    const { fold, log } = laneRun()
    playTwoPlanets(log)
    const run = {
      lane: 'money-p200',
      worldSeed: 7,
      lastPlanet: 2,
      isFinished: true,
      endedOnPlanet: 2,
      endTick: 25 * MINUTE,
    }
    const lines = moneyLaneNdjsonOf(run, fold.summarize()).trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0])).toMatchObject({ ...run, largestPrice: '1.2345e+104' })
    expect(JSON.parse(lines[2])).toMatchObject({ planet: 2 })
  })
})
