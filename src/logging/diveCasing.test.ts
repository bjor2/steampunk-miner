import { describe, expect, it } from 'vitest'
import { countDrillDives, diveTicksWithoutCasing } from './diveCasing'
import type { RunEventData, RunEventName } from './eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

function line<N extends RunEventName>(tick: number, event: N, data: RunEventData<N>): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
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

  it("counts a drill span's cells and the rings of its lining run (ticket 420)", () => {
    const span = line(20, 'drill_cut', {
      spans: 2,
      cells: 4,
      ticks: 8,
      units: 0,
      value: '0e+0',
      ores: [],
      energy: 0,
      heat: 0,
      stop: 'command',
    })
    const lining = line(21, 'casing_lined', {
      lengthMm: 1000,
      band: 1,
      grade: 1,
      type: 'iron',
      price: '2e+0',
      rings: 2,
    })
    expect(diveTicksWithoutCasing([leave(10), span, lining, leave(100), span])).toEqual([100])
    expect(countDrillDives([leave(10), span, lining])).toBe(1)
  })

  it('ignores a dive that destroyed nothing', () => {
    expect(diveTicksWithoutCasing([leave(10), leave(100), dig(110), ring(111)])).toEqual([])
  })
})
