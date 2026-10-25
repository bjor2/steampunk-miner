import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { BLOCK_SIZE_M } from '../../../../systems/render/collapseTelegraph'
import { blockIdOf } from '../../../../systems/world/collapseBlock'
import { collapseFallsAfter, EMPTY_FALL_WATCH, fallOfBlock } from './blastCollapseFall'

const BLOCK = blockIdOf({ cx: 1, cy: -2, index: 9 })
const OTHER = blockIdOf({ cx: 0, cy: 0, index: 0 })

function rolled(block: string, isCollapsing: boolean): DomainEvent {
  return {
    type: 'BlastCollapseRolled',
    tick: 10,
    blastSeq: 1,
    block,
    collapseBp: 5000,
    roll: isCollapsing ? 10 : 9000,
    isCollapsing,
  }
}

function started(block: string): DomainEvent {
  return { type: 'CollapseStarted', tick: 70, block, samplesFilled: 200, vehiclesHit: 0 }
}

// D8 (#868): a blast's collapse falls after its 1 s blink, never as a second blast; the kernel
// telegraphs the blink, the slice adds the fall of the blocks a blast rolled.

describe('blast collapse falls (D8 #868)', () => {
  it('watches a block the blast rolled to collapse and lets it fall when its refill starts', () => {
    const watching = collapseFallsAfter(EMPTY_FALL_WATCH, [rolled(BLOCK, true)])
    expect(watching).toEqual({ watched: [BLOCK], falls: [] })
    const fallen = collapseFallsAfter(watching, [started(BLOCK)])
    expect(fallen.watched).toEqual([])
    expect(fallen.falls).toEqual([fallOfBlock(BLOCK)])
  })

  it('ignores a roll that did not collapse and a refill of a block no blast rolled', () => {
    const watch = collapseFallsAfter(EMPTY_FALL_WATCH, [rolled(BLOCK, false), started(OTHER)])
    expect(watch).toEqual(EMPTY_FALL_WATCH)
  })

  it('forgets a cancelled block and every block on arriving at a planet', () => {
    const watching = collapseFallsAfter(EMPTY_FALL_WATCH, [
      rolled(BLOCK, true),
      rolled(OTHER, true),
    ])
    const cancelled = collapseFallsAfter(watching, [
      { type: 'CollapseCancelled', tick: 20, block: BLOCK },
    ])
    expect(cancelled.watched).toEqual([OTHER])
    const arrived = collapseFallsAfter(cancelled, [
      { type: 'PlanetEntered', tick: 30, planetSeed: 1, generatorVersion: 1, radius: 100 },
    ])
    expect(arrived.watched).toEqual([])
  })

  it("places a fall on the block's face in metres, a block wide", () => {
    const fall = fallOfBlock(blockIdOf({ cx: 0, cy: 0, index: 1 }))
    expect(fall).toEqual({ x0: BLOCK_SIZE_M, y0: 0, sizeM: BLOCK_SIZE_M })
    expect(fallOfBlock('not a block')).toBeNull()
  })

  it('keeps only this batch of falls, not the last one', () => {
    const fallen = collapseFallsAfter(collapseFallsAfter(EMPTY_FALL_WATCH, [rolled(BLOCK, true)]), [
      started(BLOCK),
    ])
    expect(collapseFallsAfter(fallen, []).falls).toEqual([])
  })
})
