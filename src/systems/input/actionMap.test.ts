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

  it('binds the #33 defaults: WASD and arrows aim, Space lifts, E docks', () => {
    const bindings = defaultBindings(ACTION_MAP)
    expect(bindings.aim_left).toEqual(['KeyA', 'ArrowLeft'])
    expect(bindings.aim_right).toEqual(['KeyD', 'ArrowRight'])
    expect(bindings.aim_down).toEqual(['KeyS', 'ArrowDown'])
    expect(bindings.aim_up).toEqual(['KeyW', 'ArrowUp'])
    expect(bindings.lift).toEqual(['Space'])
    expect(bindings.interact).toEqual(['KeyE'])
  })

  it('lets a key press different actions in different contexts', () => {
    const bindings = defaultBindings(ACTION_MAP)
    expect(actionsOfChord(ACTION_MAP, bindings, 'vehicle', 'KeyE')).toEqual(['interact'])
    expect(actionsOfChord(ACTION_MAP, bindings, 'platform', 'KeyE')).toEqual(['ui_confirm'])
    expect(actionsOfChord(ACTION_MAP, bindings, 'settings', 'KeyQ')).toEqual([])
  })

  it('refuses a broken file whole and lists its problems', () => {
    const broken = { ...SHIPPED_ACTION_MAP, inputMapVersion: 2, actions: [] }
    expect(actionMapProblems(broken)).toContain('inputMapVersion must be 1')
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
    expect(boundLabel(defaultBindings(ACTION_MAP), 'ui_prev_panel')).toBe('Shift+Tab')
  })

  it('lists every problem of a broken override and leaves the defaults in force', () => {
    const outcome = bindingsWithOverrides(ACTION_MAP, {
      warp_drive: { keyboard: ['KeyX'] },
      aim_up: { keyboard: ['KeyNope'] },
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
      aim_up: { keyboard: ['KeyNope'] },
      aim_down: { keyboard: ['KeyE'] },
      lift: { keyboard: [] },
    })
    expect(outcome.bindings).toEqual(defaultBindings(ACTION_MAP))
    expect(outcome.problems).toEqual([
      'aim_up: "KeyNope" is not a known key code',
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
