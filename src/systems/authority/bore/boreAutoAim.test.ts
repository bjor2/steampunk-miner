import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import { swapTileCells } from '../../world/terrainCellEdits'
import { CELL_KIND, GROUND_CELL, kindOfCell, oreCell, RESOURCE_FAMILY } from '../../world/worldCell'
import { cellAt } from '../../world/worldState'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { createScriptedSession, PARAMS } from '../scriptedSession'
import { BORE_BEARING_COUNT } from './boreAim'
import { AUTO_RIG, searSlice } from './boreAutoFixtures'
import { ARC_BEARINGS, bestBoreShotOf, cellReadsOf, type BoreAimAsk } from './boreAutoAim'
import { shotOf } from './boreFire'
import { BORE_STATS, standInPocket } from './boreFixtures'

const LOW_ORE = oreCell(RESOURCE_FAMILY.metal, 0)
const HIGH_ORE = oreCell(RESOURCE_FAMILY.metal, 1)
/** Every ore cell this far from the rig turns to ground, so only a spec's own ore is there. */
const CLEARED_REACH = 12

function aimAsk(stats = BORE_STATS, isIncomeCapUsed = false): BoreAimAsk {
  return { playerId: 'p1', params: PARAMS, stats, shot: shotOf(stats), isIncomeCapUsed }
}

/** The rig in its pocket at `AUTO_RIG`, facing `facing`, with only `ore` for ore round it. */
function rigAmong(
  ore: readonly { tile: TilePoint; cell: number }[],
  facing: Facing,
): AuthorityState {
  const session = createScriptedSession()
  standInPocket(session, AUTO_RIG, 0)
  const state = session.state()
  const cleared = groundRound(state)
  const swaps = [...cleared, ...ore.map(({ tile, cell }) => ({ ...tile, cell }))]
  const world = swapTileCells(state.world, swaps).world
  const vehicle = vehicleOf(state, 'p1')
  const pose = { ...(vehicle.pose as NonNullable<typeof vehicle.pose>), facing }
  return withVehicle({ ...state, world }, 'p1', { ...vehicle, pose })
}

function groundRound(state: AuthorityState): { tx: number; ty: number; cell: number }[] {
  const swaps: { tx: number; ty: number; cell: number }[] = []
  for (let dy = -CLEARED_REACH; dy <= CLEARED_REACH; dy++) {
    for (let dx = -CLEARED_REACH; dx <= CLEARED_REACH; dx++) {
      const tile = { tx: AUTO_RIG.tx + dx, ty: AUTO_RIG.ty + dy }
      if (kindOfCell(cellAt(state.world, PARAMS, tile)) === CELL_KIND.ore) {
        swaps.push({ ...tile, cell: GROUND_CELL })
      }
    }
  }
  return swaps
}

const east = (cells: number): TilePoint => ({ tx: AUTO_RIG.tx + cells, ty: AUTO_RIG.ty })
const west = (cells: number): TilePoint => ({ tx: AUTO_RIG.tx - cells, ty: AUTO_RIG.ty })

function bestTileOf(state: AuthorityState): TilePoint | null {
  return bestBoreShotOf(state, aimAsk())?.best?.tile ?? null
}

describe('bore gun auto aim: the tie order (ticket 317)', () => {
  it('takes the higher sale value over fewer cells', () =>
    withRegistrations([searSlice()], () => {
      const ore = [
        { tile: east(1), cell: LOW_ORE },
        { tile: east(3), cell: HIGH_ORE },
      ]
      expect(bestTileOf(rigAmong(ore, FACING.right))).toEqual(east(3))
    }))

  it('takes fewer cells over the facing side when the values are equal', () =>
    withRegistrations([searSlice()], () => {
      const ore = [
        { tile: west(1), cell: LOW_ORE },
        { tile: east(3), cell: LOW_ORE },
      ]
      expect(bestTileOf(rigAmong(ore, FACING.right))).toEqual(west(1))
    }))

  it('takes the side the rig faces when value and cells are equal', () =>
    withRegistrations([searSlice()], () => {
      const ore = [
        { tile: west(2), cell: LOW_ORE },
        { tile: east(2), cell: LOW_ORE },
      ]
      expect(bestTileOf(rigAmong(ore, FACING.right))).toEqual(east(2))
      expect(bestTileOf(rigAmong(ore, FACING.left))).toEqual(west(2))
    }))

  it('takes the lower bearing when value, cells and side are all equal', () =>
    withRegistrations([searSlice()], () => {
      const ore = [
        { tile: west(2), cell: LOW_ORE },
        { tile: east(2), cell: LOW_ORE },
      ]
      const shot = bestBoreShotOf(rigAmong(ore, FACING.down), aimAsk())
      expect(shot?.best?.tile).toEqual(west(2))
      // Bearings 0 to 127 are the rig's left half, so the lower bearing is the western cell's.
      expect((shot?.bearing ?? BORE_BEARING_COUNT) * 2).toBeLessThan(BORE_BEARING_COUNT)
    }))

  it('scores every ore cell 0 once the trip cap is used up, so nothing is a target', () =>
    withRegistrations([searSlice()], () => {
      const state = rigAmong([{ tile: east(2), cell: HIGH_ORE }], FACING.right)
      expect(bestBoreShotOf(state, aimAsk(BORE_STATS, true))).toBeNull()
      expect(bestBoreShotOf(state, aimAsk())).not.toBeNull()
    }))

  it('finds no target in bare ground', () =>
    withRegistrations([searSlice()], () => {
      expect(bestBoreShotOf(rigAmong([], FACING.right), aimAsk())).toBeNull()
    }))
})

describe('bore gun auto aim: cost (ticket 317, inside #154)', () => {
  it('reads at most the arc bearings times the 10-cell range cap in cells per pick', () =>
    withRegistrations([searSlice()], () => {
      const state = rigAmong([], FACING.right)
      const reads = cellReadsOf(state, aimAsk({ ...BORE_STATS, rangeCells: 10 }))
      expect(reads).toBeGreaterThan(0)
      expect(reads).toBeLessThanOrEqual(ARC_BEARINGS.length * 10)
    }))
})
