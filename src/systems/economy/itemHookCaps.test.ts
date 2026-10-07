import { describe, expect, it } from 'vitest'
import { fromCanonical, toCanonical, type Money } from '../money'
import { ECONOMY } from './economy'
import { createFieldReader } from './economyFieldReader'
import {
  cappedScalarOf,
  incomeUnderRoomOf,
  rankedBySummedScore,
  readItemHookCaps,
  type IncomeClaim,
} from './itemHookCaps'

// The kernel's caps and folds for item hooks (GD lock on #206, ticket 323).

const TRIP_ROOM = fromCanonical('100')

function claim(incomeItemId: string, value: string): IncomeClaim {
  return { incomeItemId, value: fromCanonical(value) }
}

function asText(claims: readonly IncomeClaim[]) {
  return claims.map(({ incomeItemId, value }) => ({ incomeItemId, value: toCanonical(value) }))
}

function roomOf(room: Money) {
  return () => room
}

describe('item hook caps', () => {
  it('reads a reach of at most twelve cells from economy.json', () => {
    expect(ECONOMY.itemHookCaps).toEqual({ reachCellsMax: 12 })
  })

  it('refuses a reach below none', () => {
    const reader = createFieldReader()
    readItemHookCaps(reader, { reachCellsMax: -1 })
    expect(reader.problems).toContain('itemHookCaps.reachCellsMax must be 0 or more')
  })

  it('adds every answer to the lane value and holds the total to the cap', () => {
    expect(cappedScalarOf(3, [], 12)).toBe(3)
    expect(cappedScalarOf(3, [2, 4], 12)).toBe(9)
    expect(cappedScalarOf(3, [8, 8], 12)).toBe(12)
  })

  it('never folds a scalar below none', () => {
    expect(cappedScalarOf(2, [-5], 12)).toBe(0)
  })

  it('ranks candidates by their summed score, then in the lane order', () => {
    const tiles = [
      { tx: 0, ty: 0 },
      { tx: 1, ty: 0 },
      { tx: 2, ty: 0 },
    ]
    expect(rankedBySummedScore(tiles, [])).toEqual(tiles)
    expect(rankedBySummedScore(tiles, [[0, 1, 0], [0, 0, 1]])).toEqual([
      tiles[1],
      tiles[2],
      tiles[0],
    ])
    expect(rankedBySummedScore(tiles, [[0, 0, 3], [2]])).toEqual([tiles[2], tiles[0], tiles[1]])
  })

  it('sums two income claims on one item before the trip cap clamps them', () => {
    const claims = [claim('combo.assay_drain', '60'), claim('combo.assay_drain', '60')]
    expect(asText(incomeUnderRoomOf(claims, roomOf(TRIP_ROOM)))).toEqual([
      { incomeItemId: 'combo.assay_drain', value: '1e+2' },
    ])
  })

  it('keeps each item to its own room and pays nothing once the cap is used', () => {
    const claims = [claim('item.b', '30'), claim('item.a', '20'), claim('item.b', '30')]
    const rooms: Record<string, Money> = { 'item.a': fromCanonical('0'), 'item.b': TRIP_ROOM }
    expect(asText(incomeUnderRoomOf(claims, (itemId) => rooms[itemId]))).toEqual([
      { incomeItemId: 'item.a', value: '0e+0' },
      { incomeItemId: 'item.b', value: '6e+1' },
    ])
  })

  it('pays the same whatever order the claims come in', () => {
    const claims = [claim('item.a', '70'), claim('item.b', '10'), claim('item.a', '50')]
    const reversed = [...claims].reverse()
    expect(asText(incomeUnderRoomOf(reversed, roomOf(TRIP_ROOM)))).toEqual(
      asText(incomeUnderRoomOf(claims, roomOf(TRIP_ROOM))),
    )
  })
})
