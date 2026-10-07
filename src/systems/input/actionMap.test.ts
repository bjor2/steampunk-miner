import { describe, expect, it } from 'vitest'
import SHIPPED_ACTION_MAP from '../../data/input/actions.json'
import {
  ACTION_IDS,
  ACTION_MAP,
  actionMapProblems,
  actionsOfChord,
  bindingsWithOverrides,
  boundLabel,
  defaultBindings,
} from './actionMap'

describe('action map', () => {
  it('ships an actions.json with zero problems', () => {
    expect(actionMapProblems(SHIPPED_ACTION_MAP)).toEqual([])
  })

  it('gives every action a display name', () => {
    for (const action of ACTION_MAP.actions) expect(action.displayName).not.toBe('')
  })

  it('lists every registered action exactly once', () => {
    expect(ACTION_MAP.actions.map((action) => action.id).sort()).toEqual([...ACTION_IDS].sort())
  })

  it('binds the version 2 defaults of #40: W lifts, S drills down, Space and E dock', () => {
    const bindings = defaultBindings(ACTION_MAP)
    expect(ACTION_MAP.inputMapVersion).toBe(2)
    expect(bindings.lift).toEqual(['KeyW', 'ArrowUp'])
    expect(bindings.aim_down).toEqual(['KeyS', 'ArrowDown'])
    expect(bindings.aim_left).toEqual(['KeyA', 'ArrowLeft'])
    expect(bindings.aim_right).toEqual(['KeyD', 'ArrowRight'])
    expect(bindings.interact).toEqual(['Space', 'KeyE'])
    expect(bindings.ui_confirm).toEqual(['Enter', 'Space', 'KeyE'])
  })

  it('has no aim_up and no panel jumps, and zooms with =, - and 0 (#37, #39, #40)', () => {
    const ids: readonly string[] = ACTION_MAP.actions.map((action) => action.id)
    for (const gone of ['aim_up', 'ui_prev_panel', 'ui_next_panel']) {
      expect(ids).not.toContain(gone)
      expect(ACTION_IDS).not.toContain(gone)
    }
    const bindings = defaultBindings(ACTION_MAP)
    expect([bindings.zoom_in, bindings.zoom_out, bindings.zoom_reset]).toEqual([
      ['Equal'],
      ['Minus'],
      ['Digit0'],
    ])
  })

  it('binds the five power-up slots to Digit1 to Digit5 while driving, rebindable (#217)', () => {
    const bindings = defaultBindings(ACTION_MAP)
    const slots = ['use_slot_1', 'use_slot_2', 'use_slot_3', 'use_slot_4', 'use_slot_5'] as const
    expect(slots.map((slot) => bindings[slot])).toEqual([
      ['Digit1'],
      ['Digit2'],
      ['Digit3'],
      ['Digit4'],
      ['Digit5'],
    ])
    expect(actionsOfChord(ACTION_MAP, bindings, 'vehicle', 'Digit3')).toEqual(['use_slot_3'])
    expect(actionsOfChord(ACTION_MAP, bindings, 'platform', 'Digit3')).toEqual([])
    const rebound = bindingsWithOverrides(ACTION_MAP, { use_slot_1: { keyboard: ['KeyZ'] } })
    expect(rebound.problems).toEqual([])
    expect(actionsOfChord(ACTION_MAP, rebound.bindings, 'vehicle', 'KeyZ')).toEqual(['use_slot_1'])
  })

  it('never lets Space lift: in the vehicle it docks, on a menu it confirms', () => {
    const bindings = defaultBindings(ACTION_MAP)
    expect(actionsOfChord(ACTION_MAP, bindings, 'vehicle', 'Space')).toEqual(['interact'])
    expect(actionsOfChord(ACTION_MAP, bindings, 'platform', 'Space')).toEqual(['ui_confirm'])
    expect(actionsOfChord(ACTION_MAP, bindings, 'vehicle', 'KeyW')).toEqual(['lift'])
  })

  it('lets a key press different actions in different contexts', () => {
    const bindings = defaultBindings(ACTION_MAP)
    expect(actionsOfChord(ACTION_MAP, bindings, 'vehicle', 'KeyE')).toEqual(['interact'])
    expect(actionsOfChord(ACTION_MAP, bindings, 'platform', 'KeyE')).toEqual(['ui_confirm'])
    expect(actionsOfChord(ACTION_MAP, bindings, 'settings', 'KeyQ')).toEqual([])
  })

  it('refuses a broken file whole and lists its problems', () => {
    const broken = { ...SHIPPED_ACTION_MAP, inputMapVersion: 1, actions: [] }
    expect(actionMapProblems(broken)).toContain('inputMapVersion must be 2')
    expect(actionMapProblems(broken)).toContain('aim_left must be listed exactly once')
  })
})

describe('rebinding', () => {
  it('puts a valid override in force', () => {
    const outcome = bindingsWithOverrides(ACTION_MAP, { aim_left: { keyboard: ['KeyJ'] } })
    expect(outcome.problems).toEqual([])
    expect(outcome.bindings.aim_left).toEqual(['KeyJ'])
    expect(actionsOfChord(ACTION_MAP, outcome.bindings, 'vehicle', 'KeyJ')).toEqual(['aim_left'])
    expect(actionsOfChord(ACTION_MAP, outcome.bindings, 'vehicle', 'KeyA')).toEqual([])
  })

  it('labels an action with the key now bound to it', () => {
    const { bindings } = bindingsWithOverrides(ACTION_MAP, { aim_left: { keyboard: ['KeyJ'] } })
    expect(boundLabel(bindings, 'aim_left')).toBe('J')
    expect(boundLabel(defaultBindings(ACTION_MAP), 'aim_left')).toBe('A')
    expect(boundLabel(defaultBindings(ACTION_MAP), 'lift')).toBe('W')
    expect(boundLabel(defaultBindings(ACTION_MAP), 'interact')).toBe('Space')
  })

  it('lists every problem of a broken override and leaves the defaults in force', () => {
    const outcome = bindingsWithOverrides(ACTION_MAP, {
      warp_drive: { keyboard: ['KeyX'] },
      aim_left: { keyboard: ['KeyNope'] },
      aim_down: { keyboard: ['KeyE'] },
      lift: { keyboard: [] },
      aim_right: { keyboard: ['Escape'] },
    })
    expect(outcome.bindings).toEqual(defaultBindings(ACTION_MAP))
    expect(outcome.problems).toEqual(
      expect.arrayContaining([
        '"warp_drive" is not an action id',
        'aim_right: Escape is reserved and cannot be rebound',
      ]),
    )
  })

  it('lists unknown keys, duplicates and empty bindings once the ids are sound', () => {
    const outcome = bindingsWithOverrides(ACTION_MAP, {
      aim_left: { keyboard: ['KeyNope'] },
      aim_down: { keyboard: ['KeyE'] },
      lift: { keyboard: [] },
    })
    expect(outcome.bindings).toEqual(defaultBindings(ACTION_MAP))
    expect(outcome.problems).toEqual([
      'aim_left: "KeyNope" is not a known key code',
      'lift has no key bound',
      'KeyE is bound to both aim_down and interact in the vehicle context',
    ])
  })

  it('keeps Escape on the actions that close a layer when they are rebound', () => {
    const { bindings } = bindingsWithOverrides(ACTION_MAP, { ui_cancel: { keyboard: ['KeyX'] } })
    expect(bindings.ui_cancel).toEqual(['KeyX', 'Escape'])
  })

  it('refuses an override that is not an object of action ids', () => {
    expect(bindingsWithOverrides(ACTION_MAP, ['KeyA']).problems).toEqual([
      'binding overrides must be an object of action ids',
    ])
  })
})
