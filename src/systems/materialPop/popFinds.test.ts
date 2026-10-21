import { describe, expect, it } from 'vitest'
import { POP_GUARDED_STEP_MIN } from '../../constants/materialPop'
import { surfaceOreTiles } from '../authority/scriptedSession'
import type { DomainEvent } from '../authority/domainEvent'
import { oreTier } from '../economy/oreEconomy'
import { bandOfTile } from '../world/planetGeometry'
import { planetParamsFor } from '../world/planetParams'
import { EMPTY_CARVE_WATCH, followCarves, type CarvedCell } from './carveWatch'
import { createPopFind, readPopFind } from './popFinds'

// Option B's finds (ticket 616): a carved cell pops only when its unit reached the hold, keyed by
// its material and stepped by its tier over the band's own ore (HS conditions 1 and 3 on #442).

const PLAYER = 'p1'
const PLANET_1 = planetParamsFor(1, 1)
const TILE = surfaceOreTiles(1, PLANET_1)[0]
const BAND_TIER = oreTier(1, bandOfTile(PLANET_1, TILE.tx, TILE.ty))
const TICK = 40

const stamp = { tick: TICK, playerId: PLAYER, seq: 1 }

const destroyed: DomainEvent = { type: 'TileDestroyed', ...TILE, kind: 'ore', ...stamp }

function addedAt(resourceTier: number, oreId = 'copper_t1'): DomainEvent {
  const unit = { amount: 1, value: '10', depthTiles: 3, chunk: '0,0' }
  return { type: 'CargoAdded', resourceTier, oreId, ...unit, ...stamp }
}

const gated: DomainEvent = {
  type: 'DrillGated',
  ...TILE,
  oreId: 'copper_t1',
  family: 'metal',
  tier: BAND_TIER,
  gateKind: 'hardness',
  outcome: 'lost',
  required: '2',
  have: '1',
  ...stamp,
}

/** The carve hook's cell for one batch whose cut took the whole cell. */
function carvedOf(events: DomainEvent[]): CarvedCell[] {
  const batch = { events, tick: TICK, planetIndex: 1, playerId: PLAYER, densitySumOf: () => 0 }
  return followCarves(EMPTY_CARVE_WATCH, batch).carved
}

function findOf(events: DomainEvent[]) {
  const out = createPopFind()
  const cells = carvedOf(events)
  return cells.length === 1 && readPopFind(cells[0], PLANET_1, out) ? out : null
}

describe('material pop finds', () => {
  it('pops a drilled unit as its material, at its cell and carve tick', () => {
    expect(findOf([destroyed, addedAt(BAND_TIER)])).toEqual({
      ...TILE,
      materialId: 'copper_t1',
      step: 0,
      lane: 'common',
      tick: TICK,
    })
  })

  it('steps a unit by its tier over its band’s own ore', () => {
    expect(findOf([destroyed, addedAt(BAND_TIER + 1)])?.step).toBe(1)
    expect(findOf([destroyed, addedAt(BAND_TIER + 3)])?.step).toBe(3)
  })

  it('counts a lower ore moved into the band as common', () => {
    expect(findOf([destroyed, addedAt(BAND_TIER - 1)])?.step).toBe(0)
  })

  it('puts rare-or-better finds in the guarded lane and the rest in the common one', () => {
    const below = findOf([destroyed, addedAt(BAND_TIER + POP_GUARDED_STEP_MIN - 1)])
    const rare = findOf([destroyed, addedAt(BAND_TIER + POP_GUARDED_STEP_MIN)])
    expect([below?.lane, rare?.lane]).toEqual(['common', 'guarded'])
  })

  it('gives a gated cell no pop: its carry was discarded', () => {
    expect(carvedOf([destroyed, gated])).toHaveLength(1)
    expect(findOf([destroyed, gated])).toBeNull()
  })

  it('gives a full hold’s lost unit and bare ground no pop', () => {
    const full: DomainEvent = { type: 'StorageFull', lostUnits: 1, ...stamp }
    const ground: DomainEvent = { ...destroyed, kind: 'ground' }
    expect(findOf([destroyed, full])).toBeNull()
    expect(findOf([ground])).toBeNull()
  })
})
