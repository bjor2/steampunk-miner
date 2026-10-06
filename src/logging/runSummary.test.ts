import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import { createSummarySink } from './eventSink'
import { writeRunSummary, type RunDocumentTransport } from './runDocuments'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'
import { deriveSummary, formatRunSummary } from './runSummary'

let nextSeq = 0

function line<N extends RunEventName>(
  tick: number,
  event: N,
  data: RunEventData<N>,
  place: { planet?: number; depthTiles?: number } = {},
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
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

/** A workshop buy of one level, as the store logs it. */
function bought(tick: number, upgradeId: string, toLevel: number): RunEvent {
  return line(tick, 'upgrade_purchased', {
    upgradeId,
    fromLevel: toLevel - 1,
    toLevel,
    cost: '1e+2',
    kind: 'geometric',
    costCurveId: `cost.vehicle.${upgradeId}`,
    totalLevel: toLevel,
    visualTier: 1,
    statsAfter: {},
  })
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

/** A `resource_collected` line of one unit of `oreId`, as the projection writes it (#122). */
function collected(tick: number, oreId: string): RunEvent {
  return line(tick, 'resource_collected', {
    resourceTier: 1,
    amount: 1,
    value: '1.5e+0',
    oreId,
    oreDepthTiles: 4,
    chunk: '0,9',
  })
}

const METAL = 'kernel.metal.t1'
const CRYSTAL = 'kernel.crystal.t2'

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

  it('counts the lining bill paid at the Sell bay as spending, beside what was charged and forgiven', () => {
    const lined = (price: string) =>
      line(990, 'casing_lined', { lengthMm: 1000, band: 1, grade: 1, type: 'standard', price })
    const settled = line(995, 'lining_settled', { billed: '6e+0', paid: '4e+0', forgiven: '2e+0' })
    const run = [...PLAYED_RUN.slice(0, -1), lined('3e+0'), lined('3e+0'), settled]
    expect(deriveSummary(run)).toMatchObject({
      liningSpending: '4e+0',
      liningCharged: '6e+0',
      liningForgiven: '2e+0',
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

  it('keeps the band-1 dig time per metre of each planet with the levels it was entered and left with', () => {
    const run = [
      ...PLAYED_RUN.slice(0, 7),
      bought(985, 'drill_power', 13),
      bought(986, 'drill_tip', 7),
      ...PLAYED_RUN.slice(7),
    ]
    expect(deriveSummary(run).firstBandDigTicks).toEqual({
      '1': { arrival: 40, departure: 24 },
      '2': { arrival: 24, departure: 24 },
    })
  })

  it('keeps the band-5 dig time of each planet too, the band the sawtooth is judged on', () => {
    const run = [
      ...PLAYED_RUN.slice(0, 7),
      bought(985, 'drill_power', 13),
      bought(986, 'drill_tip', 7),
      ...PLAYED_RUN.slice(7),
    ]
    expect(deriveSummary(run).sawtoothBandDigTicks).toEqual({
      '1': { arrival: 608, departure: 24 },
      '2': { arrival: 45, departure: 45 },
    })
  })

  it('enters the planet with the start levels a scenario sets on the tick it is entered', () => {
    const setDrill = line(0, 'debug_command_applied', {
      command: 'debug.setUpgrade',
      args: { upgradeId: 'drill_power', level: 13 },
    })
    const run = [...PLAYED_RUN.slice(0, 2), setDrill, ...PLAYED_RUN.slice(2)]
    expect(deriveSummary(run).firstBandDigTicks['1']).toEqual({ arrival: 24, departure: 24 })
  })

  it('calls a run with no game_ended interrupted', () => {
    expect(deriveSummary(PLAYED_RUN.slice(0, -1)).outcome).toBe('interrupted')
  })

  it('ignores wall-clock time, so two runs of the same ticks summarise identically', () => {
    const otherMachine = PLAYED_RUN.map((event) => ({ ...event, timestamp: event.timestamp * 3 }))
    expect(deriveSummary(otherMachine)).toEqual(deriveSummary(PLAYED_RUN))
  })

  it('writes exactly the summary derived from the events the run recorded', async () => {
    const written: string[] = []
    const transport: RunDocumentTransport = {
      writeRunDocument: async (_runId, _document, json) => void written.push(json),
    }
    await writeRunSummary(transport, 'run_test', summaryFoldedFrom(PLAYED_RUN))
    expect(JSON.parse(written[0])).toMatchObject({ runId: 'run_test', moneySpent: '1.5905e+2' })
    expect(JSON.parse(written[0])).toEqual(deriveSummary(PLAYED_RUN))
  })
})

function summaryFoldedFrom(events: readonly RunEvent[]) {
  const sink = createSummarySink()
  events.forEach(sink.append)
  return sink.summarize()
}

describe('run summary: mined order (#122)', () => {
  it('keeps the minerals in mined order, run-length encoded, with the units of each ore', () => {
    const ores = [METAL, METAL, METAL, CRYSTAL, METAL, CRYSTAL, CRYSTAL]
    const run = [...PLAYED_RUN, ...ores.map((oreId, index) => collected(9100 + index, oreId))]
    expect(deriveSummary(run)).toMatchObject({
      minedOrder: [
        [METAL, 3],
        [CRYSTAL, 1],
        [METAL, 1],
        [CRYSTAL, 2],
      ],
      minedUnitsByOre: { [METAL]: 4, [CRYSTAL]: 3 },
    })
  })

  it('has an empty mined order for a run that collected nothing', () => {
    expect(deriveSummary(PLAYED_RUN)).toMatchObject({ minedOrder: [], minedUnitsByOre: {} })
  })

  it('leaves a mined order taken mid-run as it was while the run goes on', () => {
    const sink = createSummarySink()
    sink.append(collected(10, METAL))
    const atPageHide = sink.summarize()
    sink.append(collected(11, METAL))
    sink.append(collected(12, CRYSTAL))
    expect(atPageHide).toMatchObject({ minedOrder: [[METAL, 1]], minedUnitsByOre: { [METAL]: 1 } })
  })
})

describe('summary sink (#117)', () => {
  it('folds the events as they arrive into the summary.json text the whole log derives', () => {
    expect(formatRunSummary(summaryFoldedFrom(PLAYED_RUN))).toBe(
      formatRunSummary(deriveSummary(PLAYED_RUN)),
    )
  })

  it('keeps exact totals after far more events than a log could hold', () => {
    const sale = line(960, 'resource_sold', { items: [], value: '1.5e+1', mode: 'all' })
    const sink = createSummarySink()
    for (let count = 0; count < 200_000; count += 1) sink.append(sale)
    expect(sink.summarize()).toMatchObject({ eventCount: 200_000, moneyEarned: '3e+6' })
  })

  it('leaves a summary taken mid-run as it was while the run goes on', () => {
    const sink = createSummarySink()
    PLAYED_RUN.forEach(sink.append)
    const atPageHide = sink.summarize()
    sink.append(line(9200, 'core_completed', { durationTicks: 60 }, { planet: 2 }))
    sink.append(line(9300, 'planet_entered', { planetSeed: 9, generatorVersion: 1, radius: 500 }))
    expect(atPageHide.coreCompletedTicks).toEqual({})
    expect(atPageHide.milestones.planetReached).toEqual({ '1': 0, '2': 9000 })
  })
})
