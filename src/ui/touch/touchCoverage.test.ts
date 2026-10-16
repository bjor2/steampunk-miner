import { describe, expect, it } from 'vitest'
import { contentOf } from '../../systems/registries/content'
import { acceptedSlotsOf, LOADOUT_SLOT_IDS } from '../../systems/registries/vehicleLoadout'
import { SLOT_ACTION_IDS } from '../../systems/input/touchControls'
import { actionsOfRule, type TouchAnchor } from '../../systems/input/touchBindings'
import { touchBindingRows, type TouchBindingRow } from '../registries/touchBindings'

// The first rows' coverage list (#474: the HS list on #470), judged on the loaded slices: every
// item the HS names is reached on touch by a row, or by the slot taps its slot answers to.

const POWER_UP_SLOT_IDS = LOADOUT_SLOT_IDS.filter((slot) => slot.startsWith('powerup.'))

/** Items used from a power-up slot: the whistle, the governor's powers, the grapple, the clamp. */
const SLOT_USED_ITEM_IDS = [
  'power.resonance_whistle',
  'power.chronometric_governor',
  'power.aether_condenser',
  'power.grapple_winch',
  'power.lode_clamp',
]

function rowsAnchoredOn(rowId: string): TouchBindingRow[] {
  return touchBindingRows().filter((row) => isRowAnchor(row.anchor, rowId))
}

function isRowAnchor(anchor: TouchAnchor, rowId: string): boolean {
  return typeof anchor === 'object' && 'row' in anchor && anchor.row === rowId
}

function slotTapRowOf(slot: string): TouchBindingRow | undefined {
  return touchBindingRows().find(
    (row) => typeof row.anchor === 'object' && 'slot' in row.anchor && row.anchor.slot === slot,
  )
}

describe('touch coverage of the HS list', () => {
  it.each(['bore_gun', 'weapon.cementing_round'])(
    'fires %s from the fire tile, whose drag has a tap path',
    (anchor) => {
      const [row] = rowsAnchoredOn(anchor)
      expect(row.touch).toEqual({
        gesture: 'drag',
        action: 'fire_ground_gun',
        tapPath: 'fire_ground_gun',
      })
      expect(row.Tile).toBeDefined()
    },
  )

  it('detonates through the plant button once remote_detonator is open', () => {
    const [row] = rowsAnchoredOn('remote_detonator')
    expect(row.touch).toEqual({ gesture: 'tap', action: 'plant_charge' })
    expect(touchBindingRows().some((kernel) => kernel.id === 'kernel.cluster_plant_charge')).toBe(
      true,
    )
  })

  it('taps every power-up slot with its own key, from a tile drawn while it holds an item', () => {
    const rows = POWER_UP_SLOT_IDS.map(slotTapRowOf)
    expect(rows.map((row) => row?.touch.gesture)).toEqual(POWER_UP_SLOT_IDS.map(() => 'tap'))
    expect(rows.map((row) => row?.touch.action)).toEqual(SLOT_ACTION_IDS)
    expect(rows.every((row) => row?.Tile !== undefined)).toBe(true)
  })

  it.each(SLOT_USED_ITEM_IDS)('reaches %s through a power-up slot tap', (itemId) => {
    const slots = acceptedSlotsOf(itemId).filter((slot) => POWER_UP_SLOT_IDS.includes(slot))
    expect(slots.length).toBeGreaterThan(0)
    expect(slots.flatMap((slot) => actionsOfRule(slotTapRowOf(slot)!))).not.toEqual([])
  })

  it('triggers every combo only through its parents, which take no control of their own', () => {
    const combos = contentOf('vehicle-item').filter((item) => item.id.startsWith('combo.'))
    expect(combos.length).toBeGreaterThan(0)
    expect(combos.filter((combo) => acceptedSlotsOf(combo.id).length > 0)).toEqual([])
    expect(touchBindingRows().filter((row) => isComboAnchor(row.anchor))).toEqual([])
  })
})

function isComboAnchor(anchor: TouchAnchor): boolean {
  return typeof anchor === 'object' && 'row' in anchor && anchor.row.startsWith('combo.')
}
