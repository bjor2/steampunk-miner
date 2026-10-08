import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { ECONOMY } from '../../../systems/economy/economy'
import type { MinedOre } from '../../../systems/authority/minedOre'
import type { ItemHook } from '../../../systems/registries/itemHooks'
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { PowerUpUse } from '../../power-up-core'
import { cellsInHookOrder, hookedReachOf } from './drainHooks'
import type { DrainableCell } from './drainReach'
import { balanceOf, extractionItemOf, type ExtractionItem } from './extractionItems'

// The mineral drain consults the kernel item hooks for its reach and its cell order (GD lock on
// #206, ticket 325). Fixture hooks register through a fake slice, so no combo slice is imported.

const DRAIN = extractionItemOf('power.mineral_drain') as ExtractionItem
const STATE = createAuthorityState({ planetIndex: 9, planetSeed: 83921, playerIds: ['p1'] })
const USE: PowerUpUse = {
  playerId: 'p1',
  itemId: DRAIN.itemId,
  slot: 'powerup.1',
  tick: 70,
  origin: { tx: 0, ty: -40 },
  mark: 1,
  magnitude: 4,
}

/** The ore a cell would pay: never read by the consults. */
const PLAIN_ORE = {
  resourceTier: 9,
  saleTier: 9,
  oreId: 'kernel.ore.t9',
  depthTiles: 40,
  chunk: '0,-2',
} as MinedOre

/** Four drainable cells, nearest first, as `drainReachOf` hands them on. */
const CELLS: readonly DrainableCell[] = [
  { tx: 0, ty: -39 },
  { tx: -1, ty: -40 },
  { tx: 1, ty: -40 },
  { tx: 0, ty: -41 },
].map((tile) => ({ tile, ore: PLAIN_ORE }))

function fixtureSlice(hooks: readonly ItemHook[]): SliceDefinition {
  return { id: 'drain-fixture', register: (r) => hooks.forEach((hook) => r.itemHook(hook)) }
}

function reachHook(id: string, cells: number, parentItemId = DRAIN.itemId): ItemHook {
  return {
    id: `drain-fixture.${id}`,
    laneId: 'extraction',
    parentItemId,
    hook: 'reach',
    answer: () => cells,
  }
}

function orderHook(id: string, scores: number[]): ItemHook {
  return {
    id: `drain-fixture.${id}`,
    laneId: 'extraction',
    parentItemId: DRAIN.itemId,
    hook: 'targetOrder',
    answer: () => scores,
  }
}

function reachWith(hooks: readonly ItemHook[]): number {
  return withRegistrations([fixtureSlice(hooks)], () => hookedReachOf(STATE, USE, DRAIN))
}

function orderWith(hooks: readonly ItemHook[]): TilePoint[] {
  return withRegistrations([fixtureSlice(hooks)], () =>
    cellsInHookOrder(STATE, USE, DRAIN, CELLS).map(({ tile }) => tile),
  )
}

const tilesOf = (cells: readonly DrainableCell[]) => cells.map(({ tile }) => tile)

describe('mineral drain item hooks', () => {
  it('keeps its own radius and nearest-first order when no hook is registered', () => {
    expect(reachWith([])).toBe(balanceOf(DRAIN).reachTiles)
    expect(orderWith([])).toEqual(tilesOf(CELLS))
  })

  it('widens its radius by the whole cells a reach hook answers', () => {
    expect(reachWith([reachHook('wider', 2)])).toBe(balanceOf(DRAIN).reachTiles + 2)
  })

  it('never reaches past the 12-cell cap, however many hooks answer', () => {
    expect(ECONOMY.itemHookCaps.reachCellsMax).toBe(12)
    expect(reachWith([reachHook('far', 50)])).toBe(12)
    expect(reachWith([reachHook('first', 6), reachHook('second', 6)])).toBe(12)
  })

  it('ignores a reach hook on another item', () => {
    expect(reachWith([reachHook('other', 5, 'power.slurry_siphon')])).toBe(
      balanceOf(DRAIN).reachTiles,
    )
  })

  it('takes the highest summed score first, then keeps nearest first among ties', () => {
    const order = orderWith([orderHook('a', [0, 1, 0, 2]), orderHook('b', [0, 1, 0, 0])])
    expect(order).toEqual([CELLS[1].tile, CELLS[3].tile, CELLS[0].tile, CELLS[2].tile])
  })

  it('only reorders the drainable cells it was given, adding and dropping none', () => {
    const order = orderWith([orderHook('lopsided', [-3, 9, 0, 4, 7, 7])])
    expect(order).toHaveLength(CELLS.length)
    expect(new Set(order)).toEqual(new Set(tilesOf(CELLS)))
  })
})
