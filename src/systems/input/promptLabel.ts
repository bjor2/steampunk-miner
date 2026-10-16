/**
 * Prompts follow the input device (P1-4 of #470, the TD's architecture comment section 1 point 4):
 * one read names the control a prompt asks for, the key on a keyboard, the pad glyph on a pad and
 * the button word on touch, so a touch player never reads a key name. The touch words and the
 * device hint words (`{inputVerb}`, `{inputNoun}`, the P&C copy rules on #470) ship as data in
 * `src/data/input/touchPrompts.json`; no prompt line hard-codes a device word.
 */
import TOUCH_PROMPTS from '../../data/input/touchPrompts.json'
import {
  ACTION_IDS,
  boundLabel,
  boundPadLabel,
  isActionId,
  type ActionId,
  type Bindings,
} from './actionMap'

export const INPUT_DEVICES = ['keyboard', 'pad', 'touch'] as const

export type InputDevice = (typeof INPUT_DEVICES)[number]

/** Both binding tables in force, named as the store names them. */
export interface DeviceBindings {
  bindings: Bindings
  padBindings: Bindings
}

/** What a prompt reads to name a control: the bindings and the device the player last used. */
export interface PromptSource extends DeviceBindings {
  inputDevice: InputDevice
}

/** The device hint placeholders a prompt line may carry. */
export const DEVICE_WORD_NAMES = ['inputVerb', 'inputNoun'] as const

export type DeviceWordName = (typeof DEVICE_WORD_NAMES)[number]

interface TouchPrompts {
  touchPromptsVersion: number
  labels: Readonly<Record<ActionId, string>>
  deviceWords: Readonly<Record<InputDevice, Readonly<Record<DeviceWordName, string>>>>
}

const TOUCH_PROMPTS_VERSION = 1

const PLACEHOLDER = /\{([^}]*)\}/g

export const SHIPPED_TOUCH_PROMPTS: TouchPrompts = loadShippedTouchPrompts()

/** The control that presses an action, as the player of that device reads it. */
export function promptLabelOf(
  actionId: ActionId,
  bindings: DeviceBindings,
  inputDevice: InputDevice,
): string {
  if (inputDevice === 'pad') return boundPadLabel(bindings.padBindings, actionId)
  if (inputDevice === 'touch') return SHIPPED_TOUCH_PROMPTS.labels[actionId]
  return boundLabel(bindings.bindings, actionId)
}

/** "press" or "tap", "key" or "control": the device word a `{inputVerb}`-style placeholder prints. */
export function deviceWordOf(name: DeviceWordName, inputDevice: InputDevice): string {
  return SHIPPED_TOUCH_PROMPTS.deviceWords[inputDevice][name]
}

/** A prompt line with every `{actionId}` and device word printed; other placeholders stay. */
export function fillPromptLine(line: string, prompts: PromptSource): string {
  return line.replace(PLACEHOLDER, (match, name: string) => promptWordOf(name, prompts) ?? match)
}

/** What a `{name}` placeholder prints on the prompt's device; null when it is not a prompt word. */
export function promptWordOf(name: string, prompts: PromptSource): string | null {
  if (isActionId(name)) return promptLabelOf(name, prompts, prompts.inputDevice)
  if (isDeviceWordName(name)) return deviceWordOf(name, prompts.inputDevice)
  return null
}

export function isDeviceWordName(value: string): value is DeviceWordName {
  return (DEVICE_WORD_NAMES as readonly string[]).includes(value)
}

/**
 * The device the prompts follow: touch while the touch controls show (a touch shows them, a key or
 * a pad press hides them, #173), else the keyboard. No pad flag exists yet, so a pad player reads
 * the keys, as before this ticket.
 */
export function inputDeviceOf(source: { isTouchControlsShown: boolean }): InputDevice {
  return source.isTouchControlsShown ? 'touch' : 'keyboard'
}

/** The prompt source of the store's fields: both binding tables and the device in use. */
export function promptSourceOf(
  source: DeviceBindings & { isTouchControlsShown: boolean },
): PromptSource {
  return {
    bindings: source.bindings,
    padBindings: source.padBindings,
    inputDevice: inputDeviceOf(source),
  }
}

/** Every problem with a touch prompts file; empty when it names every action and device. */
export function touchPromptsProblems(raw: TouchPrompts): string[] {
  return [
    ...(raw.touchPromptsVersion === TOUCH_PROMPTS_VERSION
      ? []
      : [`touchPromptsVersion must be ${TOUCH_PROMPTS_VERSION}`]),
    ...ACTION_IDS.filter((id) => !isFilledText(raw.labels[id])).map(
      (id) => `${id} has no touch label`,
    ),
    ...INPUT_DEVICES.flatMap((device) => deviceWordProblems(raw, device)),
  ]
}

function deviceWordProblems(raw: TouchPrompts, device: InputDevice): string[] {
  return DEVICE_WORD_NAMES.filter((name) => !isFilledText(raw.deviceWords[device]?.[name])).map(
    (name) => `${device} has no ${name}`,
  )
}

function isFilledText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}

function loadShippedTouchPrompts(): TouchPrompts {
  const shipped = TOUCH_PROMPTS as TouchPrompts
  const problems = touchPromptsProblems(shipped)
  if (problems.length > 0) throw new Error(`touchPrompts.json refused: ${problems.join('; ')}`)
  return shipped
}
