import { describe, expect, it } from 'vitest'
import { ACTION_MAP, bindingsWithOverrides, defaultBindings } from './actionMap'
import { sheetTabKeyLabelsOf, starMapKeyLabelOf, toolCellKeyLabelOf } from './keyTags'

// Desktop's brass key tags (spec #678, ticket 768): the key that presses a tool cell or jumps to
// a sheet tab, read from the bindings in force.

const DEFAULTS = defaultBindings(ACTION_MAP)

describe('tool cell key tags', () => {
  it('tags a cell with its number key while that key presses its tool', () => {
    expect(toolCellKeyLabelOf(1, 'use_slot_1', 0, DEFAULTS)).toBe('1')
    expect(toolCellKeyLabelOf(8, 'fire_ground_gun', 0, DEFAULTS)).toBe('8')
  })

  it("tags a cell with the tool's own key once the number key was rebound away", () => {
    const { bindings } = bindingsWithOverrides(ACTION_MAP, { use_slot_1: { keyboard: ['KeyJ'] } })
    expect(toolCellKeyLabelOf(1, 'use_slot_1', 0, bindings)).toBe('J')
  })

  it('tags a turned tray page’s cells with their number keys, which follow the page', () => {
    expect(toolCellKeyLabelOf(1, 'plant_charge', 1, DEFAULTS)).toBe('1')
  })
})

describe('sheet tab key tags', () => {
  const tabs = [
    { id: 'workshop.outfitter', title: 'Outfitter' },
    { id: 'hold', title: 'Hold' },
    { id: 'probe.misc', title: 'Probe Tab' },
  ]

  it('tags each tab bearing a place’s word with the key that jumps to it, and no other', () => {
    expect(sheetTabKeyLabelsOf(tabs, DEFAULTS)).toEqual({ 'workshop.outfitter': 'O', hold: 'H' })
  })

  it('shows a rebound jump key on its tab', () => {
    const { bindings } = bindingsWithOverrides(ACTION_MAP, { open_hold: { keyboard: ['KeyY'] } })
    expect(sheetTabKeyLabelsOf(tabs, bindings).hold).toBe('Y')
  })
})

describe('star map key tag (ticket 769)', () => {
  it('tags the star map button with M, and with the new key once rebound', () => {
    expect(starMapKeyLabelOf(DEFAULTS)).toBe('M')
    const rebound = bindingsWithOverrides(ACTION_MAP, { open_star_map: { keyboard: ['KeyN'] } })
    expect(starMapKeyLabelOf(rebound.bindings)).toBe('N')
  })
})
