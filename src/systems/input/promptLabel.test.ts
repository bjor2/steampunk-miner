import { describe, expect, it } from 'vitest'
import { ACTION_IDS, ACTION_MAP, bindingsWithOverrides } from './actionMap'
import {
  fillPromptLine,
  inputDeviceOf,
  promptLabelOf,
  promptSourceOf,
  SHIPPED_TOUCH_PROMPTS,
  touchPromptsProblems,
} from './promptLabel'
import { KEYBOARD_PROMPTS, shippedPromptsOn, TOUCH_PROMPTS } from './promptFixtures'

describe('prompt labels (P1-4 of #470)', () => {
  it('names the first bound key on a keyboard', () => {
    expect(promptLabelOf('interact', KEYBOARD_PROMPTS, 'keyboard')).toBe('Space')
    expect(promptLabelOf('fire_ground_gun', KEYBOARD_PROMPTS, 'keyboard')).toBe('Left Mouse')
  })

  it('names the first bound pad chord on a pad', () => {
    expect(promptLabelOf('interact', KEYBOARD_PROMPTS, 'pad')).toBe('A')
    expect(promptLabelOf('next_charge_size', KEYBOARD_PROMPTS, 'pad')).toBe('LB+B')
  })

  it('names the touch control on touch, whatever the keys are bound to', () => {
    const { bindings } = bindingsWithOverrides(ACTION_MAP, { interact: { keyboard: ['KeyJ'] } })
    expect(promptLabelOf('interact', { ...TOUCH_PROMPTS, bindings }, 'touch')).toBe('Dock button')
    expect(promptLabelOf('aim_left', TOUCH_PROMPTS, 'touch')).toBe('stick left')
  })

  it('follows a rebinding on the keyboard at once', () => {
    const { bindings } = bindingsWithOverrides(ACTION_MAP, { interact: { keyboard: ['KeyJ'] } })
    expect(promptLabelOf('interact', { ...KEYBOARD_PROMPTS, bindings }, 'keyboard')).toBe('J')
  })

  it('has a touch word for every action and both device words for every device', () => {
    expect(touchPromptsProblems(SHIPPED_TOUCH_PROMPTS)).toEqual([])
    expect(ACTION_IDS.every((id) => SHIPPED_TOUCH_PROMPTS.labels[id].length > 0)).toBe(true)
  })

  it('refuses a touch prompts file missing an action or a device word, listing each', () => {
    const { interact: _dropped, ...labels } = SHIPPED_TOUCH_PROMPTS.labels
    const raw = {
      ...SHIPPED_TOUCH_PROMPTS,
      labels: labels as typeof SHIPPED_TOUCH_PROMPTS.labels,
      deviceWords: {
        ...SHIPPED_TOUCH_PROMPTS.deviceWords,
        pad: { inputVerb: 'press', inputNoun: '' },
      },
    }
    expect(touchPromptsProblems(raw)).toEqual([
      'interact has no touch label',
      'pad has no inputNoun',
    ])
  })

  it('follows touch while the touch controls show, else the keyboard', () => {
    expect(inputDeviceOf({ isTouchControlsShown: true })).toBe('touch')
    expect(inputDeviceOf({ isTouchControlsShown: false })).toBe('keyboard')
    const store = { ...KEYBOARD_PROMPTS, isTouchControlsShown: true }
    expect(promptSourceOf(store).inputDevice).toBe('touch')
  })

  it('fills action and device word placeholders and leaves the others for the caller', () => {
    const line = '{inputVerb} any {inputNoun}, {interact} docks, {fee}'
    expect(fillPromptLine(line, KEYBOARD_PROMPTS)).toBe('press any key, Space docks, {fee}')
    expect(fillPromptLine(line, TOUCH_PROMPTS)).toBe('tap any control, Dock button docks, {fee}')
    expect(fillPromptLine(line, shippedPromptsOn('pad'))).toBe('press any button, A docks, {fee}')
  })
})
