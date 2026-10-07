import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { dockSiteOf } from '../../../systems/world/dockSite'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { DOCK_VIEW_COLUMNS, DOCK_VIEW_ROWS, gatedTilesNearDock } from './gatesNearDock'
import { lockMarkerOf } from './render/lockMarkers'

// Ticket 299: the gated cells a docked vehicle sees, for the e2e checks of the ground.

const FROST = 17
const SEED_WITH_A_DENSE_CELL = 10

function stateOn(planetIndex: number, planetSeed: number) {
  return createAuthorityState({ planetIndex, planetSeed, playerIds: ['p1'] })
}

describe('gated cells near the dock', () => {
  it('lists only cells inside the docked view, each under the pad', () => {
    const state = stateOn(FROST, SEED_WITH_A_DENSE_CELL)
    const params = planetParamsOf(state.planet) as PlanetParams
    const { dockPoint, padRow } = dockSiteOf(params)
    const tiles = gatedTilesNearDock(params)
    expect(tiles.length).toBeGreaterThan(0)
    for (const { tx, ty, rowsUnderPad } of tiles) {
      expect(Math.abs(tx - dockPoint.tx)).toBeLessThanOrEqual(DOCK_VIEW_COLUMNS)
      expect(rowsUnderPad).toBe(padRow - ty)
      expect(rowsUnderPad).toBeGreaterThanOrEqual(1)
      expect(rowsUnderPad).toBeLessThanOrEqual(DOCK_VIEW_ROWS)
    }
  })

  it('lists cells that wear a lock marker, and no ungated one', () => {
    const state = stateOn(FROST, SEED_WITH_A_DENSE_CELL)
    const tiles = gatedTilesNearDock(planetParamsOf(state.planet) as PlanetParams)
    expect(tiles.map(({ gate }) => gate.kind)).not.toContain('none')
    for (const tile of tiles) expect(lockMarkerOf(state, 'p1', tile).kind).not.toBe('none')
  })
})
