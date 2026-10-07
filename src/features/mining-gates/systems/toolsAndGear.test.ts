import { describe, expect, it } from 'vitest'
import { openDrillGates } from '../../../systems/authority/drillGates'
import { applyQueuedTerrainEdits } from '../../../systems/authority/terrain/terrainEditTick'
import { queueTerrainEdit } from '../../../systems/authority/terrain/terrainEdits'
import { cellDensitySum } from '../../../systems/world/cellYield'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { cellAt } from '../../../systems/world/worldState'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { grantItems, paramsOn, sessionOn, setTipMajor, worldCellOfGate } from './gateFixtures'
import type { CellGateKind } from './gateTable'

// #142 "Constraints on other systems" (ticket 236): power-ups and drill gear go through canMine
// for every cell they touch and treat rig-gated and dynamite-gated cells as solid. Planet 7 of the
// first pacing seed holds generated cells of every kind; the power-up is a terrain edit queued as
// a slice's command queues one, the drill gear asks the drill's canMine as `drillGearCut` does.

const GATED_KINDS: readonly CellGateKind[] = ['rig', 'dynamite', 'dense']
const PLANET = 7
/** Planet 7's on-curve tip major (#6: 7 + 3(p - 1)), so the drill rule itself stops nothing. */
const ON_CURVE_TIP = 25

/** Ticks the clock until the queue is empty: it applies at most 2 chunks a tick (K6). */
function settledEditsOf(start: AuthorityState): AuthorityState {
  let state = start
  for (let tick = start.tick + 1; state.terrainEdits.length > 0; tick++) {
    state = applyQueuedTerrainEdits(state, tick).state
  }
  return state
}

function onPlanetSeven() {
  const session = sessionOn(PLANET)
  const params = paramsOn(session)
  const tileOf = (kind: CellGateKind) => worldCellOfGate(params, (gate) => gate.kind === kind).tile
  return { session, params, tileOf }
}

describe('gated cells against power-ups and drill gear', () => {
  it('leaves rig-gated, dynamite-gated and dense cells whole under a power-up edit, extractor or not', () => {
    const { session, params, tileOf } = onPlanetSeven()
    grantItems(session, ['rig.resonance'])
    const gated = GATED_KINDS.map(tileOf)
    const common = tileOf('none')
    const queued = queueTerrainEdit(session.state(), {
      playerId: 'p1',
      source: 'probe.drain',
      cells: [...gated, common].map((tile) => ({ kind: 'density' as const, ...tile, density: 0 })),
    })
    const after = settledEditsOf(queued)
    const densityOf = (tile: TilePoint) => cellDensitySum(after.world, params, tile)
    const fullOf = (tile: TilePoint) => cellDensitySum(queued.world, params, tile)
    expect(gated.map(densityOf)).toEqual(gated.map(fullOf))
    expect(densityOf(common)).toBe(0)
  })

  it('lets drill gear take no rig-gated or dynamite-gated cell the drill has no means for', () => {
    const { session, params, tileOf } = onPlanetSeven()
    setTipMajor(session, ON_CURVE_TIP)
    const gates = openDrillGates(session.state(), 'p1', params, () => 24)
    const canGearTake = (kind: CellGateKind) => {
      const tile = tileOf(kind)
      return gates.canMine({ tile, cell: cellAt(session.state().world, params, tile) })
    }
    expect(canGearTake('rig')).toBe(false)
    expect(canGearTake('dynamite')).toBe(false)
    expect(canGearTake('none')).toBe(true)
  })

  it('reports each gated cell the gear met as gate_hit, as the drill does', () => {
    const { session, params, tileOf } = onPlanetSeven()
    setTipMajor(session, ON_CURVE_TIP)
    const gates = openDrillGates(session.state(), 'p1', params, () => 24)
    for (const kind of ['rig', 'dynamite'] as const) {
      const tile = tileOf(kind)
      gates.canMine({ tile, cell: cellAt(session.state().world, params, tile) })
    }
    expect(
      gates.refusedEvents().map((event) => event.type === 'DrillGated' && event.gateKind),
    ).toEqual(['rig', 'dynamite'])
  })
})
