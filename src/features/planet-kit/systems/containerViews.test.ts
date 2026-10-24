import { describe, expect, it } from 'vitest'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { tileOfPose, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { containerMarkersOf, containerRowsOf } from './containerViews'

// What the markers and the list show of the placed containers (ticket 823, the TD's final ruling
// on #823, points 7 and 8).

function placeAt(cell: TilePoint, ownerId: string) {
  return {
    type: 'debug.planet-kit.placeContainer',
    payload: { kind: 'cache_crate', ownerId, ...cell, ore: { '2': '4' }, coreFragments: 0 },
  } as const
}

function cellOf(session: ScriptedSession): TilePoint {
  return tileOfPose(session.vehicle().pose as VehiclePose)
}

/** A crate on planet 1 and one on planet 2, the session on planet 2. */
function cratesOnTwoPlanets(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(1, placeAt(cellOf(session), 'p1'))
  session.submit(2, { type: 'debug.setMoney', payload: { amount: '1e6' } })
  session.submit(3, { type: 'dock', payload: { bay: 'sell' } })
  session.submit(4, { type: 'buyFuel', payload: { units: 5 } })
  session.submit(5, { type: 'jumpToPlanet', payload: { system: '1', planet: '2' } })
  session.submit(6, { type: 'undock', payload: {} })
  session.submit(7, placeAt(cellOf(session), 'p1'))
  return session
}

describe('placed container views (ticket 823)', () => {
  it('lists this planet’s containers first, then the other planets’, each named by its kind', () => {
    const rows = containerRowsOf(cratesOnTwoPlanets().state(), 'p1')
    expect(rows.map(({ key, name, isHere, units }) => ({ key, name, isHere, units }))).toEqual([
      { key: '1:2#1', name: 'Cache Crate', isHere: true, units: 4 },
      { key: '1:1#1', name: 'Cache Crate', isHere: false, units: 4 },
    ])
  })

  it('offers a pickup only of a container here, in reach and the player’s to open', () => {
    const state = cratesOnTwoPlanets().state()
    expect(containerRowsOf(state, 'p1').map((row) => row.canTake)).toEqual([true, false])
  })

  it('marks only this planet’s containers on the map', () => {
    const markers = containerMarkersOf(cratesOnTwoPlanets().state(), 'p1')
    expect(markers.map((marker) => marker.key)).toEqual(['1:2#1'])
  })

  it('hides a container whose owner is not in the session until they come back', () => {
    const session = createScriptedSession()
    session.submit(1, placeAt(cellOf(session), 'p1'))
    session.submit(1, placeAt(cellOf(session), 'departed'))
    const rows = containerRowsOf(session.state(), 'p1')
    expect(rows.map((row) => [row.ownerId, row.isOwn])).toEqual([['p1', true]])
  })
})
