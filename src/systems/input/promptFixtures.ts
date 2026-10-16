/**
 * The shipped bindings read on each device, for specs over the prompt texts (P1-4 of #470): the
 * keyboard fixture prints the default keys, the touch fixture the button words.
 */
import { ACTION_MAP, defaultBindings, defaultPadBindings } from './actionMap'
import type { InputDevice, PromptSource } from './promptLabel'

export function shippedPromptsOn(inputDevice: InputDevice): PromptSource {
  return {
    bindings: defaultBindings(ACTION_MAP),
    padBindings: defaultPadBindings(ACTION_MAP),
    inputDevice,
  }
}

export const KEYBOARD_PROMPTS: PromptSource = shippedPromptsOn('keyboard')

export const TOUCH_PROMPTS: PromptSource = shippedPromptsOn('touch')
