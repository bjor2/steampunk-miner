import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import { writeRunSummary, type RunDocumentTransport } from './runDocuments'
import type { RunEvent } from './runEvent'
import { deriveSummary } from './runSummary'

let nextSeq = 0

function line<N extends RunEventName>(
  tick: number,
  event: N,
  data: RunEventData<N>,
  place: { planet?: number; depthTiles?: number } = {},
): RunEvent {
  return {
    v: 1,
    seq: nextSeq++,
    tick,
    // Wall time differs on every machine; the summary must never read it.
    timestamp: tick * 7.3,
    runId: 'run_test',
    playerId: 'p1',
    planet: place.planet ?? 1,
    depthTiles: place.depthTiles ?? 0,
    event,
    data,
  } as RunEvent
}

const PLAYED_RUN: readonly RunEvent[] = [
  line(0, 'game_started', {
    gameVersion: '0.1.0',
    buildCommit: 'abc',
    platform: 'browser',
    debug: false,
  }),
  line(0, 'planet_entered', { planetSeed: 7, generatorVersion: 1, radius: 300 }),
  line(600, 'mining_interval', {
    tilesDestroyed: 40,
    collected: [
      { tier: 1, amount: 10, value: '1.5e+1' },
      { tier: 2, amount: 3, value: '1.0125e+1' },
    ],
    drillDamageDealt: '4e+3',
  }),
  line(
    900,
    'mining_session_ended',
    {
      maxDepthTiles: 23,
      tilesDestroyed: 40,
      cargoValue: '2.5125e+1',
      damageTaken: '1.25e+1',
      durationTicks: 900,
    },
    { depthTiles: 2 },
  ),
  line(960, 'resource_sold', {
    items: [{ tier: 1, amount: 10 }],
    value: '2.5125e+1',
    mode: 'all',
  }),
  line(970, 'energy_recharged', { from: 1000, to: 36000, cost: '6.75e+0' }),
  line(980, 'upgrade_purchased', {
    upgradeId: 'cargo_hold',
    fromLevel: 0,
    toLevel: 1,
    cost: '2.4e+1',
    kind: 'linear',
    costCurveId: 'cost.vehicle.cargo_hold',
    totalLevel: 1,
    visualTier: 1,
    statsAfter: { cargoCapacity: '1.4e+1' },
  }),
  line(5000, 'vehicle_destroyed', { cause: 'enemy', kind: 'crawler', tier: 1, arc: 'rear' }),
  line(5100, 'rescue_triggered', { cause: 'destroyed', fee: '6.75e+1', cargoLostValue: '0e+0' }),
  line(9000, 'travel_started', { fromPlanet: 1, toPlanet: 2, cost: '6.08e+1', coreSpent: 63 }),
  line(9000, 'planet_entered', { planetSeed: 8, generatorVersion: 1, radius: 400 }, { planet: 2 }),
  line(9100, 'game_ended', { reason: 'quit' }, { planet: 2 }),
]

describe('run summary', () => {
  it('sums earnings and every kind of spending as exact canonical money', () => {
    expect(deriveSummary(PLAYED_RUN)).toMatchObject({
      moneyEarned: '2.5125e+1',
      upgradeSpending: '2.4e+1',
      chargingSpending: '6.75e+0',
      rescueFees: '6.75e+1',
      travelSpending: '6.08e+1',
      moneySpent: '1.5905e+2',
      resourceUnitsCollected: 13,
      resourceValueCollected: '2.5125e+1',
      damageTaken: '1.25e+1',
    })
  })

  it('counts paid lining as spending and keeps the charged total beside it', () => {
    const lined = (price: string, paid: string) =>
      line(990, 'casing_lined', { lengthMm: 1000, band: 1, grade: 1, price, paid })
    const run = [...PLAYED_RUN.slice(0, -1), lined('3e+0', '3e+0'), lined('3e+0', '1e+0')]
    expect(deriveSummary(run)).toMatchObject({
      liningSpending: '4e+0',
      liningCharged: '6e+0',
      moneySpent: '1.6305e+2',
    })
  })

  it('counts time in ticks with a seconds view', () => {
    expect(deriveSummary(PLAYED_RUN)).toMatchObject({
      durationTicks: 9100,
      durationSeconds: 9100 / 60,
    })
  })

  it('records the tick of each first, for comparing runs', () => {
    expect(deriveSummary(PLAYED_RUN).milestones).toEqual({
      planetReached: { '1': 0, '2': 9000 },
      firstSale: 960,
      firstUpgrade: 980,
      firstDeath: 5000,
      firstCoreCompleted: null,
    })
  })

  it('tracks planets, depth, tiles and deaths', () => {
    expect(deriveSummary(PLAYED_RUN)).toMatchObject({
      outcome: 'ended',
      endReason: 'quit',
      planetsVisited: [1, 2],
      deepestPlanet: 2,
      maxDepthTiles: 23,
      tilesDestroyed: 40,
      vehicleDeaths: 1,
      upgradesPurchased: 1,
      eventCount: PLAYED_RUN.length,
    })
  })

  it('keeps the last level of each track and the tick each planet core was completed', () => {
    const run = [
      ...PLAYED_RUN.slice(0, -1),
      line(9050, 'debug_command_applied', {
        command: 'debug.setUpgrade',
        args: { upgradeId: 'hull', level: 4 },
      }),
      line(9060, 'core_completed', { durationTicks: 60 }, { planet: 2 }),
    ]
    expect(deriveSummary(run)).toMatchObject({
      upgradeLevels: { cargo_hold: 1, hull: 4 },
      coreCompletedTicks: { '2': 9060 },
    })
  })

  it('calls a run with no game_ended interrupted', () => {
    expect(deriveSummary(PLAYED_RUN.slice(0, -1)).outcome).toBe('interrupted')
  })

  it('ignores wall-clock time, so two runs of the same ticks summarise identically', () => {
    const otherMachine = PLAYED_RUN.map((event) => ({ ...event, timestamp: event.timestamp * 3 }))
    expect(deriveSummary(otherMachine)).toEqual(deriveSummary(PLAYED_RUN))
  })

  it('writes exactly the summary derived from the events it was given', async () => {
    const written: string[] = []
    const transport: RunDocumentTransport = {
      writeRunDocument: async (_runId, _document, json) => void written.push(json),
    }
    await writeRunSummary(transport, 'run_test', PLAYED_RUN)
    expect(JSON.parse(written[0])).toEqual(deriveSummary(PLAYED_RUN))
  })
})
