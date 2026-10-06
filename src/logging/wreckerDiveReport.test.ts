import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import type { RunEvent } from './runEvent'
import {
  deriveWreckerDives,
  medianRingsBreached,
  wreckerDiveAlerts,
  wreckerDiveLines,
} from './wreckerDiveReport'

let nextSeq = 0

function line<N extends RunEventName>(
  event: N,
  data: RunEventData<N>,
  place: { planet: number; depthTiles: number },
): RunEvent {
  return {
    v: 1,
    seq: nextSeq++,
    tick: nextSeq,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    ...place,
    event,
    data,
  } as RunEvent
}

/** Out to `deepest` tiles and back on `planet`, `gnawed` rings breached on the way down and
 * `collapsesHome` collapses after the deepest point, ended by a dock. */
function dive(planet: number, gnawed: number, collapsesHome: number, deepest = 80): RunEvent[] {
  const at = (depthTiles: number) => ({ planet, depthTiles })
  return [
    line('dock_left', { bay: 'sell', durationTicks: 0 }, at(0)),
    ...Array.from({ length: gnawed }, () => line('ring_gnawed', { ring: '1,2', band: 2 }, at(40))),
    line('collapse', { block: '0,0#1', samplesFilled: 9, vehiclesHit: 0 }, at(30)),
    line('tile_destroyed', { tx: 0, ty: 0, kind: 'ground' }, at(deepest)),
    ...Array.from({ length: collapsesHome }, () =>
      line('collapse', { block: '0,0#2', samplesFilled: 9, vehiclesHit: 0 }, at(50)),
    ),
    line('dock_entered', { bay: 'sell', cargoUnits: 0, energy: 0, hull: '1' }, at(0)),
  ]
}

describe('tunnel wrecker dive report (#111 Systems acceptance 3)', () => {
  it('counts per dive the rings breached and only the collapses after its deepest point', () => {
    expect(deriveWreckerDives([...dive(6, 3, 0), ...dive(7, 5, 2)])).toEqual([
      { planet: 6, ringsBreached: 3, collapsesOnWayHome: 0 },
      { planet: 7, ringsBreached: 5, collapsesOnWayHome: 2 },
    ])
  })

  it('ends a dive at a tow as well as at a dock', () => {
    const towed = dive(6, 2, 1).slice(0, -1)
    const rescue = line(
      'rescue_triggered',
      { cause: 'destroyed', fee: '0e+0', cargoLostValue: '0e+0' },
      { planet: 6, depthTiles: 50 },
    )
    expect(deriveWreckerDives([...towed, rescue])).toEqual([
      { planet: 6, ringsBreached: 2, collapsesOnWayHome: 1 },
    ])
  })

  it('takes the median of the rings breached per dive', () => {
    const dives = [1, 9, 4].map((ringsBreached) => ({
      planet: 6,
      ringsBreached,
      collapsesOnWayHome: 0,
    }))
    expect(medianRingsBreached(dives)).toBe(4)
    expect(
      medianRingsBreached([...dives, { planet: 6, ringsBreached: 6, collapsesOnWayHome: 0 }]),
    ).toBe(5)
  })

  it('reports dives on planets 6 to 9 within the target with no alert', () => {
    const events = [...dive(1, 0, 3), ...dive(6, 2, 0), ...dive(8, 5, 0), ...dive(9, 8, 0)]
    expect(wreckerDiveLines(deriveWreckerDives(events))).toEqual([
      'tunnel wrecker, planets 6 to 9: 3 dives, median 5 rings breached, 0 set off a collapse on the way home',
    ])
  })

  it('alerts on a median outside 2 to 8 rings and on more than 5 collapsing dives in 100', () => {
    const dives = deriveWreckerDives([...dive(6, 12, 1), ...dive(6, 10, 0)])
    expect(wreckerDiveAlerts(dives)).toEqual([
      'median dive had 11 rings breached, target 2 to 8',
      '1 of 2 dives set off a collapse on the way home, target at most 5 in 100',
    ])
  })

  it('says so when no dive reached planets 6 to 9, as on the two-planet slice', () => {
    expect(wreckerDiveLines(deriveWreckerDives(dive(1, 0, 0)))).toEqual([
      'tunnel wrecker: no dive on planets 6 to 9 to measure',
    ])
  })
})
