import { describe, expect, it } from 'vitest'
import { contentOf } from '../../systems/registries/content'
import { acceptedSlotsOf, LOADOUT_SLOT_IDS } from '../../systems/registries/vehicleLoadout'
import { SLOT_ACTION_IDS } from '../../systems/input/touchControls'
import { actionsOfRule, type TouchAnchor } from '../../systems/input/touchBindings'
import { toolSlotRowOf } from '../registries/toolSlots'
import { touchBindingRows, type TouchBindingRow } from '../registries/touchBindings'

// The first rows' coverage list (#474: the HS list on #470), judged on the loaded slices: every
// item the HS names is reached on touch by a row, or by the slot taps its slot answers to. The
// tools are tool slot bar cells since ticket 691, and their rows join the touch bindings.

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
  it('fires the bore gun from its tool slot cell, whose drag has a tap path', () => {
    const [row] = rowsAnchoredOn('bore_gun')
    expect(row.touch).toEqual({
      gesture: 'drag',
      action: 'fire_ground_gun',
      tapPath: 'fire_ground_gun',
    })
    expect(toolSlotRowOf(row.id)).not.toBeNull()
  })

  it('fires the cementing round with the bore gun, from the same cell (ticket 691)', () => {
    expect(rowsAnchoredOn('weapon.cementing_round')).toEqual([])
    const fires = touchBindingRows().filter((row) => row.touch.action === 'fire_ground_gun')
    expect(fires.map((row) => row.id)).toEqual(['ground-gun.bore_gun'])
  })

  it('detonates through the Plant charge cell once remote_detonator is open', () => {
    const [row] = rowsAnchoredOn('remote_detonator')
    expect(row.touch).toEqual({ gesture: 'tap', action: 'plant_charge' })
    expect(toolSlotRowOf('kernel.tool_plant_charge')).not.toBeNull()
  })

  it('taps every power-up slot with its own key, from a tool slot cell shown while it holds an item', () => {
    const rows = POWER_UP_SLOT_IDS.map(slotTapRowOf)
    expect(rows.map((row) => row?.touch.gesture)).toEqual(POWER_UP_SLOT_IDS.map(() => 'tap'))
    expect(rows.map((row) => row?.touch.action)).toEqual(SLOT_ACTION_IDS)
    expect(rows.every((row) => toolSlotRowOf(row!.id) !== null)).toBe(true)
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
