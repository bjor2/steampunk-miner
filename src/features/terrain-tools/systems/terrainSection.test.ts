import { describe, expect, it } from 'vitest'
import { dockInBay } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { buriedTile, press, sessionWith, standAt } from '../terrainTestSession'
import { LODESTONE_BEACON_ID } from './lodestoneBeacon'
import { NO_TERRAIN_TOOLS_STATE, TERRAIN_TOOLS_SECTION, terrainToolsOf } from './terrainSection'

// The `terrain-tools` section v1: a planted beacon and a held lode clamp field (ticket 285)
// round-trip through the save, a malformed body is refused, and the section leaves the state once
// the beacon has gathered at the dock.

function plantedSession() {
  const session = sessionWith({ 'powerup.1': LODESTONE_BEACON_ID })
  standAt(session, 5, buriedTile(12), FACING.right)
  session.submit(10, press())
  session.advanceTo(12)
  return session
}

describe('terrain-tools section', () => {
  it('round-trips a planted beacon through its portable form', () => {
    const value = terrainToolsOf(plantedSession().state(), 'p1')
    expect(value.beacon).not.toBeNull()
    const portable = JSON.parse(JSON.stringify(TERRAIN_TOOLS_SECTION.toPortable(value)))
    expect(TERRAIN_TOOLS_SECTION.problems(portable)).toEqual([])
    expect(TERRAIN_TOOLS_SECTION.ofPortable(portable)).toEqual(value)
  })

  it('refuses a body that is not a section or holds a malformed beacon', () => {
    expect(TERRAIN_TOOLS_SECTION.problems('nothing')).toEqual([
      'the terrain-tools section must be an object',
    ])
    expect(TERRAIN_TOOLS_SECTION.problems({ beacon: { tx: 1 } })).toEqual([
      'terrain-tools.beacon is malformed',
    ])
    expect(TERRAIN_TOOLS_SECTION.problems(NO_TERRAIN_TOOLS_STATE)).toEqual([])
  })

  it('round-trips a held clamp field and refuses a malformed one', () => {
    const clamp = { cells: [{ tx: -3, ty: 250 }], startTick: 26, finishTick: 206, energy: 40 }
    const value = { beacon: null, clamp }
    const portable = JSON.parse(JSON.stringify(TERRAIN_TOOLS_SECTION.toPortable(value)))
    expect(TERRAIN_TOOLS_SECTION.problems(portable)).toEqual([])
    expect(TERRAIN_TOOLS_SECTION.ofPortable(portable)).toEqual(value)
    expect(TERRAIN_TOOLS_SECTION.problems({ beacon: null, clamp: { cells: [{ tx: 1 }] } })).toEqual(
      ['terrain-tools.clamp is malformed'],
    )
  })

  it('leaves the state once the beacon has gathered at the dock', () => {
    const session = plantedSession()
    expect(session.state().players.p1.slices?.['terrain-tools']).toBeDefined()
    dockInBay(session, 40, 'sell')
    expect(session.state().players.p1.slices?.['terrain-tools']).toBeUndefined()
  })
})
