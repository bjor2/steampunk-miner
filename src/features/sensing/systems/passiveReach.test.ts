import { describe, expect, it } from 'vitest'
import { lastMarkOf } from '../../tech-tree'
import { sensingItemOf } from './sensingCatalogue'
import { markLadderOf } from './sensingItems'
import { passiveReachOf } from './passiveReach'

const itemNamed = (itemId: string) => sensingItemOf(itemId)!

/** Mark 1 to the item's last Mark. */
function ladderOf(itemId: string): number[] {
  const item = itemNamed(itemId)
  const marks = lastMarkOf(markLadderOf(item))
  return Array.from({ length: marks }, (_, at) => passiveReachOf(item, at + 1))
}

describe('sensing passive reach', () => {
  it('reads the Content ladders of #162 4.4 Mark by Mark (comment 6045224492)', () => {
    expect(ladderOf('passive.threat_periscope')).toEqual([10, 12, 13, 15, 17, 20])
    expect(ladderOf('passive.assay_lens')).toEqual([6, 7, 8, 9, 10, 12])
    expect(ladderOf('passive.hazard_barometer')).toEqual([5, 6, 7, 8, 9, 10])
  })

  it('adds reach with every Mark and first hits twice its base at Mark 6', () => {
    const ladders = [
      'passive.threat_periscope',
      'passive.assay_lens',
      'passive.hazard_barometer',
    ].map(ladderOf)
    ladders.forEach((ladder) => {
      expect(ladder.slice(1).every((reach, at) => reach > ladder[at])).toBe(true)
      expect(ladder).toHaveLength(6)
      expect(ladder[5]).toBe(2 * ladder[0])
    })
  })

  it('acts as bought with no Mark researched, and stays at its cap past mastery', () => {
    const lens = itemNamed('passive.assay_lens')
    expect(passiveReachOf(lens, 0)).toBe(6)
    expect(passiveReachOf(lens, 9)).toBe(12)
  })
})
