import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { itemCardOf, vehicleItemHoverLineOf } from './itemCardModel'

// A desktop hover on a slot shows the same line a phone's long press does (ticket 768, the #680
// line): the item card's flavour, read from the describer the loaded slices register.

const PLAYER = 'p1'
const ITEM_ID = 'power.steam_boost'

describe('vehicle item hover line', () => {
  it('is the flavour the slot’s long-press card prints for the same item', () => {
    const state = createScriptedSession().state()
    const card = itemCardOf(state, PLAYER, {
      item: { kind: 'vehicle-item', id: ITEM_ID },
      iconId: 'icon-panel-slots',
      name: 'Steam boost',
      cost: null,
      level: 0,
      buy: {
        id: 'powerup.1',
        label: 'Steam boost',
        action: { kind: 'closeSettings' },
        reason: null,
      },
    })
    const hoverLine = vehicleItemHoverLineOf(state, PLAYER, ITEM_ID)
    expect(hoverLine).not.toBeNull()
    expect(hoverLine).toBe(card.description?.flavour)
  })
})
