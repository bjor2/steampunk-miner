import { describe, expect, it } from 'vitest'
import AETHERIC_TUNING from '../../data/aetheric.json'
import { LIVE_LURE_CAP, lureTargetOf, type Lure } from './lureTarget'

// The resonance whistle's retarget seam (ticket 361, the #262 split): while a lure is live and the
// enemy is within its reach, the enemy's path goal is the lure cell's centre; otherwise it is the
// vehicle again (null).

const ENEMY = { x: 10_500, y: 20_500 }

/** A lure on tile (tx, ty) heard `reachTiles` tiles round, live until `untilTick`. */
function lureAt(tx: number, ty: number, reachTiles = 5, untilTick = 100): Lure {
  return { cell: { tx, ty }, reachMm: reachTiles * 1000, untilTick }
}

describe('lure target', () => {
  it('reads its live-lure cap from aetheric.json', () => {
    expect(LIVE_LURE_CAP).toBe(AETHERIC_TUNING.liveLureCap)
  })

  it('sends an enemy within reach to the centre of the lure cell', () => {
    expect(lureTargetOf(ENEMY, [lureAt(13, 20)], 10)).toEqual({ x: 13_500, y: 20_500 })
  })

  it('leaves an enemy beyond the reach on the vehicle', () => {
    expect(lureTargetOf(ENEMY, [lureAt(16, 20)], 10)).toBeNull()
  })

  it('lures right up to the last tick before the lure ends, and not on it', () => {
    const lure = lureAt(13, 20, 5, 40)
    expect(lureTargetOf(ENEMY, [lure], 39)).toEqual({ x: 13_500, y: 20_500 })
    expect(lureTargetOf(ENEMY, [lure], 40)).toBeNull()
  })

  it('leaves every enemy on the vehicle with no lure', () => {
    expect(lureTargetOf(ENEMY, [], 10)).toBeNull()
  })

  it('picks the nearest of two lures in reach', () => {
    const lures = [lureAt(14, 20), lureAt(8, 20)]
    expect(lureTargetOf(ENEMY, lures, 10)).toEqual({ x: 8_500, y: 20_500 })
  })

  it('picks the first listed of two lures at the same distance', () => {
    const lures = [lureAt(12, 20), lureAt(8, 20)]
    expect(lureTargetOf(ENEMY, lures, 10)).toEqual({ x: 12_500, y: 20_500 })
  })

  it('hears no live lure past the cap, so a far-down-the-list lure never lures', () => {
    const farAway = Array.from({ length: LIVE_LURE_CAP }, (_, index) => lureAt(100 + index, 20))
    expect(lureTargetOf(ENEMY, [...farAway, lureAt(12, 20)], 10)).toBeNull()
  })

  it('counts only live lures against the cap', () => {
    const ended = Array.from({ length: LIVE_LURE_CAP }, () => lureAt(100, 20, 5, 5))
    expect(lureTargetOf(ENEMY, [...ended, lureAt(12, 20)], 10)).toEqual({ x: 12_500, y: 20_500 })
  })
})
