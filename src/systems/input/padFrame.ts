/**
 * One polled gamepad frame, read (ticket 346): how far each bindable input is pushed, whether that
 * holds it down, and where the right stick aims. Pure: the shell hands over the pad as the browser
 * reports it, and nothing here allocates, so the store can poll every frame.
 */
import { PAD_AIM_DEADZONE, PAD_PRESS_VALUE, PAD_RELEASE_VALUE } from '../../constants/gamepad'
import { RIGHT_STICK_AXES, type PadSource } from './padCodes'

/** The part of a `GamepadButton` read here: how far it is pressed, 0 to 1. */
export interface PadButtonReading {
  readonly value: number
}

/** The part of a `Gamepad` read here; the browser's object is one as it stands. */
export interface PadReading {
  readonly buttons: readonly PadButtonReading[]
  readonly axes: readonly number[]
}

/** The right stick's push in screen directions: x right, y down, each -1 to 1. */
export interface PadAim {
  x: number
  y: number
}

/** How far an input is pushed, 0 to 1; a missing button or axis is not pushed. */
export function padInputValueOf(pad: PadReading, source: PadSource): number {
  if (source.kind === 'button') return pad.buttons[source.index]?.value ?? 0
  return Math.max(0, (pad.axes[source.index] ?? 0) * source.sign)
}

/** Down at the press value, up only below the release value. */
export function isPadInputHeld(value: number, wasHeld: boolean): boolean {
  return value >= (wasHeld ? PAD_RELEASE_VALUE : PAD_PRESS_VALUE)
}

/** Writes the right stick's push into `aim` and says whether it aims; idle inside the deadzone. */
export function readPadAimInto(pad: PadReading, aim: PadAim): boolean {
  aim.x = pad.axes[RIGHT_STICK_AXES.x] ?? 0
  aim.y = pad.axes[RIGHT_STICK_AXES.y] ?? 0
  return aim.x * aim.x + aim.y * aim.y >= PAD_AIM_DEADZONE * PAD_AIM_DEADZONE
}

/** Why a value cannot be a pad frame (the debug API's `input.padFrame`); empty when it can. */
export function padReadingProblems(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return ['a pad frame is { buttons, axes }']
  const { buttons, axes } = raw as Record<string, unknown>
  return [
    ...(Array.isArray(buttons) && buttons.every(isButtonReading)
      ? []
      : ['buttons must be a list of { value } from 0 to 1']),
    ...(Array.isArray(axes) && axes.every(isAxisValue)
      ? []
      : ['axes must be numbers from -1 to 1']),
  ]
}

function isButtonReading(button: unknown): boolean {
  if (typeof button !== 'object' || button === null) return false
  const { value } = button as Record<string, unknown>
  return typeof value === 'number' && value >= 0 && value <= 1
}

function isAxisValue(axis: unknown): boolean {
  return typeof axis === 'number' && axis >= -1 && axis <= 1
}
