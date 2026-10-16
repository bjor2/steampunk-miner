import { describe, expect, it } from 'vitest'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../authority/authorityState'
import { withItemsOwned, withSlotItem } from '../vehicle/loadoutState'
import { ACTION_MAP, type ActionId, type ActionMap } from './actionMap'
import { KERNEL_TOUCH_BINDINGS } from './kernelTouchBindings'
import {
  isTouchAnchorExposed,
  touchBindingProblemsOf,
  touchCoverageGapsOf,
  type TouchBindingRule,
} from './touchBindings'

const ITEM_ID = 'power.touch_probe'

function rowOf(touch: TouchBindingRule['touch'], extra: Partial<TouchBindingRule> = {}) {
  return { id: 'probe.item', anchor: { row: ITEM_ID }, touch, ...extra } satisfies TouchBindingRule
}

/** The shipped map with only the listed actions, so coverage is judged on a small table. */
function mapOf(actionIds: readonly ActionId[]): ActionMap {
  return { ...ACTION_MAP, actions: ACTION_MAP.actions.filter((a) => actionIds.includes(a.id)) }
}

function withKeysOf(map: ActionMap, actionId: ActionId, keyboard: readonly string[]): ActionMap {
  const actions = map.actions.map((a) => (a.id === actionId ? { ...a, keyboard } : a))
  return { ...map, actions }
}

function stateOn(planetIndex: number): AuthorityState {
  return createAuthorityState({ planetIndex, planetSeed: 7, playerIds: ['p1'] })
}

function withLoadoutOf(state: AuthorityState, owned: readonly string[], slotted: string | null) {
  const vehicle = vehicleOf(state, 'p1')
  const loadout = withSlotItem(withItemsOwned(vehicle.loadout, owned), 'powerup.1', slotted)
  return withVehicle(state, 'p1', { ...vehicle, loadout })
}

describe('touch binding rules (#474)', () => {
  it('refuses a hold of a key press with no tap path, and keeps one that names it', () => {
    const hold = rowOf({ gesture: 'hold', action: 'toggle_auto_fire' })
    expect(touchBindingProblemsOf(hold, ACTION_MAP)).toEqual([
      'touch binding "probe.item" is "hold" on the press "toggle_auto_fire" with no tapPath',
    ])
    const tapped = rowOf({ gesture: 'drag', action: 'fire_ground_gun', tapPath: 'fire_ground_gun' })
    expect(touchBindingProblemsOf(tapped, ACTION_MAP)).toEqual([])
  })

  it('keeps a drag of a drive action with no tap path, as the keys hold it too', () => {
    expect(touchBindingProblemsOf(rowOf({ gesture: 'drag', action: 'lift' }), ACTION_MAP)).toEqual(
      [],
    )
  })

  it('refuses a "none" row with no reason, and a control that presses nothing', () => {
    expect(touchBindingProblemsOf(rowOf({ gesture: 'none' }), ACTION_MAP)).toEqual([
      'touch binding "probe.item" is "none" with no reason',
    ])
    expect(touchBindingProblemsOf(rowOf({ gesture: 'tap' }), ACTION_MAP)).toEqual([
      'touch binding "probe.item" is "tap" but presses no action',
    ])
  })

  it('refuses an action no key presses, so touch never sends what the keys cannot', () => {
    const keyless = withKeysOf(ACTION_MAP, 'use_slot_1', [])
    expect(
      touchBindingProblemsOf(rowOf({ gesture: 'tap', action: 'use_slot_1' }), keyless),
    ).toEqual(['touch binding "probe.item" presses "use_slot_1", which has no key'])
  })

  it('refuses a layer the action is never pressed in', () => {
    const row = rowOf({ gesture: 'tap', action: 'use_slot_1' }, { contexts: ['platform'] })
    expect(touchBindingProblemsOf(row, ACTION_MAP)).toEqual([
      'touch binding "probe.item" works in "platform", where "use_slot_1" is never pressed',
    ])
  })

  it('refuses a row anchored on a held item', () => {
    const row = { ...rowOf({ gesture: 'tap', action: 'use_slot_1' }), anchor: { row: 'auto_guns' } }
    expect(touchBindingProblemsOf(row, ACTION_MAP)).toEqual([
      'touch binding "probe.item" anchors a held item, and held items register nothing',
    ])
  })

  it('keeps every rule in the kernel rows', () => {
    expect(KERNEL_TOUCH_BINDINGS.flatMap((row) => touchBindingProblemsOf(row, ACTION_MAP))).toEqual(
      [],
    )
  })
})

describe('touch binding coverage (#474)', () => {
  const map = mapOf(['use_slot_1', 'ui_cancel'])

  it('lists every layer where an action with a key has no touch binding', () => {
    const slotOnly = [rowOf({ gesture: 'tap', action: 'use_slot_1' })]
    expect(touchCoverageGapsOf(slotOnly, map)).toEqual(
      ['platform', 'artefact', 'settings', 'pause', 'screen', 'title'].map(
        (layer) => `"ui_cancel" has a key in "${layer}" but no touch binding`,
      ),
    )
  })

  it('counts a "none" row with its reason as reached, in the layers it names', () => {
    const rows = [
      rowOf({ gesture: 'tap', action: 'use_slot_1' }),
      rowOf({ gesture: 'none', action: 'ui_cancel' }, { reason: 'Back', contexts: ['platform'] }),
    ]
    expect(touchCoverageGapsOf(rows, map)).toHaveLength(5)
    expect(touchCoverageGapsOf(rows, map)).not.toContain(
      '"ui_cancel" has a key in "platform" but no touch binding',
    )
  })

  it('counts a tap path as reaching its action', () => {
    const drag = rowOf({ gesture: 'drag', action: 'use_slot_2', tapPath: 'use_slot_1' })
    expect(touchCoverageGapsOf([drag], mapOf(['use_slot_1', 'use_slot_2']))).toEqual([])
  })

  it('asks nothing of an action with no key', () => {
    expect(touchCoverageGapsOf([], withKeysOf(mapOf(['use_slot_1']), 'use_slot_1', []))).toEqual([])
  })
})

describe('touch binding exposure (#474)', () => {
  it('exposes an item row only while the player owns the item', () => {
    const anchor = { row: ITEM_ID }
    expect(isTouchAnchorExposed(stateOn(1), 'p1', anchor)).toBe(false)
    expect(isTouchAnchorExposed(withLoadoutOf(stateOn(1), [ITEM_ID], null), 'p1', anchor)).toBe(
      true,
    )
  })

  it('exposes a schedule row once it is FeatureUnlocked', () => {
    const anchor = { row: 'remote_detonator' }
    expect(isTouchAnchorExposed(stateOn(21), 'p1', anchor)).toBe(false)
    expect(isTouchAnchorExposed(stateOn(22), 'p1', anchor)).toBe(true)
  })

  it('exposes a slot row only while the slot holds an item', () => {
    const anchor = { slot: 'powerup.1' } as const
    const owned = withLoadoutOf(stateOn(1), [ITEM_ID], null)
    expect(isTouchAnchorExposed(owned, 'p1', anchor)).toBe(false)
    expect(isTouchAnchorExposed(withLoadoutOf(owned, [], ITEM_ID), 'p1', anchor)).toBe(true)
  })

  it('always exposes the kernel rows, which answer to their own rules', () => {
    expect(isTouchAnchorExposed(stateOn(1), 'p1', 'kernel')).toBe(true)
  })
})
