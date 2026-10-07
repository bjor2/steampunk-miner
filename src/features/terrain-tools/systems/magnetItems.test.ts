import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../../../systems/economy/economy'
import type { ItemCtx } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { flavourProblemsOf, type DescribedStatLineSpec } from '../../descriptions'
import { lastMarkOf, markStepOf } from '../../tech-tree'
import { MAGNET_ITEM_CARDS } from './magnetCards'
import {
  MAGNET_ITEMS,
  magnetItemOf,
  magnetMarkLadderOf,
  TERRAIN_MAGNETS_FAMILY,
} from './magnetItems'

// The terrain magnets' rows and cards (GD lock on #246, Content's copy on #282, ticket 282).

/** Marks past every ladder, as at P60 and P100 (#162 Endless Mark cap). */
const ENDLESS_MARKS = [20, 34]

const REPULSOR = magnetItemOf('power.repulsor_coil')!

const CLAMP = magnetItemOf('power.lode_clamp')!

const VIEW = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

function ctxAt(level: number): ItemCtx {
  return { playerId: 'p1', planetIndex: 25, level, view: VIEW }
}

function marksOf(itemId: string): number[] {
  const ladder = magnetMarkLadderOf(magnetItemOf(itemId)!)
  const marks = Array.from({ length: lastMarkOf(ladder) }, (_, index) => index + 1)
  return [...marks, ...ENDLESS_MARKS]
}

function statsAt(itemId: string, mark: number) {
  return markStepOf(magnetMarkLadderOf(magnetItemOf(itemId)!), mark).stats
}

function cardOf(itemId: string) {
  const card = MAGNET_ITEM_CARDS.find((entry) => entry.matches.id === itemId)
  if (card === undefined) throw new RangeError(`no card for ${itemId}`)
  return card
}

/** "Label: text" for each line at the card's level, as Content wrote the copy. */
function linesAt(itemId: string, level: number): string[] {
  return (cardOf(itemId).statLines as readonly DescribedStatLineSpec[]).map(
    (line) => `${line.label}: ${line.textOf?.(level)}`,
  )
}

describe('terrain magnet rows', () => {
  it('tags both members with the one terrain_magnets family', () => {
    expect(MAGNET_ITEMS.map((item) => [item.itemId, item.familyId])).toEqual([
      ['power.repulsor_coil', TERRAIN_MAGNETS_FAMILY],
      ['power.lode_clamp', TERRAIN_MAGNETS_FAMILY],
    ])
    expect(TERRAIN_MAGNETS_FAMILY).toBe('terrain_magnets')
  })

  it('repels on a tap and anchors on a hold', () => {
    expect([REPULSOR.verb, REPULSOR.input]).toEqual(['repel', 'tap'])
    expect([CLAMP.verb, CLAMP.input]).toEqual(['anchor', 'hold'])
  })

  it('sells the repulsor as a 2-cell wave and the clamp as a 180-tick hold, both on 1200 ticks', () => {
    expect(statsAt('power.repulsor_coil', 1)).toEqual({ cooldown: 1200, magnitude: 2, charges: 2 })
    expect(statsAt('power.lode_clamp', 1)).toEqual({ cooldown: 1200, magnitude: 180, charges: 2 })
  })

  it('never takes a cooldown under the 600-tick floor at any Mark', () => {
    const cooldowns = MAGNET_ITEMS.flatMap((item) =>
      marksOf(item.itemId).map((mark) => statsAt(item.itemId, mark).cooldown ?? 0),
    )
    expect(Math.min(...cooldowns)).toBe(ECONOMY.magnets.cooldownFloorTicks)
  })

  it('grows the wave radius and the hold up to twice their base, never further', () => {
    const top = (itemId: string) => statsAt(itemId, ENDLESS_MARKS[1]).magnitude
    expect(top('power.repulsor_coil')).toBe(4)
    expect(top('power.lode_clamp')).toBe(360)
  })
})

describe('terrain magnet cards', () => {
  it("prints Content's copy at Mark 1 with every number read, not written", () => {
    const cap = ECONOMY.magnets.maxCellsMoved
    expect(linesAt('power.repulsor_coil', 0)).toEqual([
      `Tap: pushes loose rubble, metal-part enemies and up to ${cap} diggable cells one cell outward into open space`,
      'Wave radius: 2 cells',
    ])
    expect(linesAt('power.lode_clamp', 0)).toEqual([
      `Hold: pins loose rubble and up to ${cap} diggable cells against collapse and moves nothing`,
      'Lasts up to: 3 s',
    ])
  })

  it('reads the stepped radius and duration at the Mark the card names', () => {
    expect(linesAt('power.repulsor_coil', 30)[1]).toBe('Wave radius: 4 cells')
    expect(linesAt('power.lode_clamp', 30)[1]).toBe('Lasts up to: 6 s')
  })

  it('gives the stepped lines a next Mark until the item is Mastered, and the cap line none', () => {
    const [capLine, steppedLine] = cardOf('power.lode_clamp')
      .statLines as readonly DescribedStatLineSpec[]
    const ref = { kind: 'vehicle-item' as const, id: 'power.lode_clamp' }
    const lastMark = lastMarkOf(magnetMarkLadderOf(CLAMP))
    expect(capLine.nextLevel?.(ref, ctxAt(1))).toBeNull()
    expect(steppedLine.nextLevel?.(ref, ctxAt(1))).toBe(2)
    expect(steppedLine.nextLevel?.(ref, ctxAt(lastMark))).toBeNull()
    expect(steppedLine.value(ref, ctxAt(1))).toBe(180)
  })

  it('gives each card a flavour line inside the copy rules and at least one stat line', () => {
    const problems = MAGNET_ITEM_CARDS.flatMap((card) =>
      flavourProblemsOf(String(card.flavour)).map((problem) => `${card.id}: ${problem}`),
    )
    expect(problems).toEqual([])
    expect(MAGNET_ITEM_CARDS.map((card) => card.statLines.length > 0)).toEqual([true, true])
    expect(MAGNET_ITEM_CARDS.map((card) => card.id)).toEqual([
      'terrain-tools.repulsor_coil',
      'terrain-tools.lode_clamp',
    ])
  })
})
