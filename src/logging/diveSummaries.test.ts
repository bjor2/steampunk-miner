import { describe, expect, it } from 'vitest'
import { deriveDiveSummaries } from './diveSummaries'
import type { RunEventData, RunEventName } from './eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

let nextSeq = 0

function line<N extends RunEventName>(
  tick: number,
  event: N,
  data: RunEventData<N>,
  planet = 4,
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: nextSeq++,
    tick,
    timestamp: tick * 7.3,
    runId: 'run_test',
    playerId: 'p1',
    planet,
    depthTiles: 0,
    event,
    data,
  } as RunEvent
}

const dockLeft = (tick: number) => line(tick, 'dock_left', { bay: 'sell', durationTicks: 30 })
const dockEntered = (tick: number) =>
  line(tick, 'dock_entered', { bay: 'sell', cargoUnits: 4, energy: 9000, hull: '100' })
const gunHit = (tick: number, shots: number) =>
  line(tick, 'gun_hit', { enemyId: 'e1', damage: '3', shots, energy: shots * 120 })
const gunKill = (tick: number) =>
  line(tick, 'enemy_killed', { kind: 'crawler', tier: 21, by: 'gun' })
const drillKill = (tick: number) =>
  line(tick, 'enemy_killed', { kind: 'crawler', tier: 21, by: 'drill' })

describe('dive summaries (#107 logging)', () => {
  it('records the energy the guns spent on each dive', () => {
    const dives = deriveDiveSummaries([
      dockLeft(100),
      gunHit(200, 1),
      gunHit(212, 1),
      gunKill(220),
      drillKill(300),
      dockEntered(400),
      dockLeft(500),
      gunHit(600, 2),
      dockEntered(700),
    ])
    expect(dives).toEqual([
      { planet: 4, leftTick: 100, dockedTick: 400, gunShots: 2, gunEnergy: 240, gunKills: 1 },
      { planet: 4, leftTick: 500, dockedTick: 700, gunShots: 2, gunEnergy: 240, gunKills: 0 },
    ])
  })

  it('counts the hits logged as a trip ends, just after its dock, for that dive', () => {
    const dives = deriveDiveSummaries([dockLeft(100), dockEntered(400), gunHit(400, 3)])
    expect(dives).toEqual([
      { planet: 4, leftTick: 100, dockedTick: 400, gunShots: 3, gunEnergy: 360, gunKills: 0 },
    ])
  })

  it('reports a dive with no guns as zero gun energy', () => {
    expect(deriveDiveSummaries([dockLeft(10), dockEntered(20)])[0]).toMatchObject({
      gunShots: 0,
      gunEnergy: 0,
    })
  })

  it('opens the first dive at the first gun line of a run that starts out on a trip', () => {
    expect(deriveDiveSummaries([gunHit(50, 1), dockEntered(90)])).toEqual([
      { planet: 4, leftTick: null, dockedTick: 90, gunShots: 1, gunEnergy: 120, gunKills: 0 },
    ])
  })
})
