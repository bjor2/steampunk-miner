import { describe, expect, it } from 'vitest'
import { countDrillDives, diveTicksWithoutCasing } from './diveCasing'
import type { RunEventData, RunEventName } from './eventNames'
import type { RunEvent } from './runEvent'

function line<N extends RunEventName>(tick: number, event: N, data: RunEventData<N>): RunEvent {
  return {
    v: 1,
    seq: tick,
    tick,
    timestamp: tick,
    runId: 'run_test',
    playerId: 'p1',
    planet: 1,
    depthTiles: 0,
    event,
    data,
  } as RunEvent
}

const leave = (tick: number) => line(tick, 'dock_left', { bay: 'sell', durationTicks: 10 })
const dig = (tick: number) => line(tick, 'tile_destroyed', { tx: 0, ty: 0, kind: 'ground' })
const ring = (tick: number) => line(tick, 'casing_placed', { samples: 4, relined: 0, grade: 1 })

describe('drill dives and casing', () => {
  it('passes a run whose every drill dive laid a ring', () => {
    const events = [leave(10), dig(20), ring(30), leave(100), dig(110), ring(120)]
    expect(diveTicksWithoutCasing(events)).toEqual([])
    expect(countDrillDives(events)).toBe(2)
  })

  it('names the departure tick of a drill dive that laid no casing', () => {
    const events = [leave(10), dig(20), ring(30), leave(100), dig(110), dig(111)]
    expect(diveTicksWithoutCasing(events)).toEqual([100])
  })

  it('ignores a dive that destroyed nothing', () => {
    expect(diveTicksWithoutCasing([leave(10), leave(100), dig(110), ring(111)])).toEqual([])
  })
})
