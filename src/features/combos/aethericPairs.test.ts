import { describe, expect, it } from 'vitest'
import { contentOf } from '../../systems/registries/content'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { vehicleItemOfferOf } from '../../systems/registries/vehicleItemSales'
import { powerUpOfItem } from '../power-up-core'
import { unlockTierOfItem } from '../tech-tree'
import { COMBO_HOLDS, COMBO_ITEMS, COMBO_TEMPLATES } from '.'

// The five aetheric pair templates (ticket 373; Content's definitions, the GD ruling of 14 Oct and
// the #206 lock): each needs both its parent items owned before any grade, every parent item of a
// registered one is a real store item with an effect, a card and a seller, and one whose effect
// cannot be built stays an unregistered vision row.

/** The first planet a generated combo is offered on (#161 section 2). */
const FIRST_ENDLESS_PLANET = 41
/** Ticket 381's ruling (c): research owns stabiliser foam with its stack; restock is #394. */
const GRANTED_BY_RESEARCH = ['consumable.stabiliser_foam']

const AETHERIC_PAIRS = COMBO_ITEMS.filter((item) => item.lanes.includes('aetheric'))
const isHeld = (itemId: string) => Object.hasOwn(COMBO_HOLDS, itemId)
const registered = AETHERIC_PAIRS.filter((item) => !isHeld(item.itemId))

const isRegisteredItem = (itemId: string) =>
  contentOf('vehicle-item').some((entry) => entry.id === itemId)

describe('aetheric pair templates', () => {
  it('writes the five with Content’s names, endless-only from P41', () => {
    expect(AETHERIC_PAIRS.map((item) => item.name)).toEqual([
      'Lull line',
      'Still foam',
      'Warning chime',
      'Pendulum anchor',
      'Quench cutters',
    ])
    AETHERIC_PAIRS.forEach((item) => expect(item.node, item.itemId).toBeNull())
    registered.forEach((item) =>
      expect(unlockTierOfItem(item.itemId), item.itemId).toBeGreaterThanOrEqual(
        FIRST_ENDLESS_PLANET,
      ),
    )
  })

  it('needs both parent items owned before any grade', () => {
    AETHERIC_PAIRS.forEach((item) => {
      const template = COMBO_TEMPLATES.find((row) => row.unlocks === item.itemId)
      expect(template?.requiresOwned, item.itemId).toEqual(item.parentItemIds)
      expect(new Set(template?.requiresOwned).size, item.itemId).toBe(2)
    })
  })

  it('names as parents only registered items with an effect, a card and a seller', () => {
    registered.forEach((item) =>
      item.parentItemIds.forEach((parent) => {
        expect(isRegisteredItem(parent), parent).toBe(true)
        expect(powerUpOfItem(parent), parent).not.toBeNull()
        expect(itemDescriptionEntryOf({ kind: 'vehicle-item', id: parent }), parent).not.toBeNull()
        const isSold = vehicleItemOfferOf(parent) !== null
        expect(isSold || GRANTED_BY_RESEARCH.includes(parent), parent).toBe(true)
      }),
    )
  })

  it('ships four and holds the lull line, whose tethered lump has no cell to lure to', () => {
    expect(registered.map((item) => item.itemId)).toEqual([
      'combo.still_foam',
      'combo.warning_chime',
      'combo.pendulum_anchor',
      'combo.quench_cutters',
    ])
    expect(COMBO_HOLDS['combo.lull_line']).toMatch(/no cell/)
    expect(isRegisteredItem('combo.lull_line')).toBe(false)
  })
})
