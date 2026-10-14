/**
 * The gamepad inputs a binding may name (ticket 346, the #314 TD lock section 2): the W3C
 * "standard" mapping's buttons by index, less Home (the platform and Steam keep it), plus the left
 * stick's four directions as buttons, so a pad press travels the key path (#217 press, #332
 * release) under its own code. The right stick is the bore gun's aim (`padAimOf`) and binds nothing
 * but its click.
 *
 * A binding may hold the pad modifier: `PadLB+PadUp` is Up pressed while LB is held, as `Shift+Tab`
 * is for keys, and the plain code answers when the chord is unbound.
 */

/** The standard mapping's button indices (W3C Gamepad, "Remapping"), Home (16) left out. */
const STANDARD_BUTTON_CODES = [
  'PadA',
  'PadB',
  'PadX',
  'PadY',
  'PadLB',
  'PadRB',
  'PadLT',
  'PadRT',
  'PadBack',
  'PadStart',
  'PadLS',
  'PadRS',
  'PadUp',
  'PadDown',
  'PadLeft',
  'PadRight',
] as const

/** A stick axis read as a button: `sign` is the axis direction that presses it. */
interface StickDirection {
  code: string
  axis: number
  sign: -1 | 1
}

/** Axes 0 and 1 are the left stick's x (right +) and y (down +) in the standard mapping. */
const LEFT_STICK_DIRECTIONS: readonly StickDirection[] = [
  { code: 'PadLStickLeft', axis: 0, sign: -1 },
  { code: 'PadLStickRight', axis: 0, sign: 1 },
  { code: 'PadLStickUp', axis: 1, sign: -1 },
  { code: 'PadLStickDown', axis: 1, sign: 1 },
]

/** Axes 2 and 3: the right stick, the bore gun's aim. */
export const RIGHT_STICK_AXES = { x: 2, y: 3 } as const

/** Where one pad code reads its value from: a button's or one direction of a stick axis. */
export type PadSource =
  { kind: 'button'; index: number } | { kind: 'axis'; index: number; sign: -1 | 1 }

export interface PadInput {
  code: string
  source: PadSource
}

/** Every bindable pad input, buttons first in index order, then the left stick's directions. */
export const PAD_INPUTS: readonly PadInput[] = [
  ...STANDARD_BUTTON_CODES.map((code, index) => ({
    code,
    source: { kind: 'button', index } as const,
  })),
  ...LEFT_STICK_DIRECTIONS.map(({ code, axis, sign }) => ({
    code,
    source: { kind: 'axis', index: axis, sign } as const,
  })),
]

/** The button held for a pad chord, as Shift is for a key chord. */
export const PAD_MODIFIER = 'PadLB'

const CHORD_JOIN = '+'
const MODIFIER_PREFIX = `${PAD_MODIFIER}${CHORD_JOIN}`
/** The modifier cannot modify itself. */
const SELF_CHORD = `${MODIFIER_PREFIX}${PAD_MODIFIER}`

const PAD_CODES: ReadonlySet<string> = new Set(PAD_INPUTS.map((input) => input.code))

/** What the player reads for each code (Xbox face letters, the layout most pads print). */
const PAD_LABELS: Readonly<Record<string, string>> = {
  PadA: 'A',
  PadB: 'B',
  PadX: 'X',
  PadY: 'Y',
  PadLB: 'LB',
  PadRB: 'RB',
  PadLT: 'LT',
  PadRT: 'RT',
  PadBack: 'Back',
  PadStart: 'Start',
  PadLS: 'L-stick click',
  PadRS: 'R-stick click',
  PadUp: 'D-pad up',
  PadDown: 'D-pad down',
  PadLeft: 'D-pad left',
  PadRight: 'D-pad right',
  PadLStickLeft: 'L-stick left',
  PadLStickRight: 'L-stick right',
  PadLStickUp: 'L-stick up',
  PadLStickDown: 'L-stick down',
}

/** A pad code (`PadA`) or a modifier chord of one (`PadLB+PadUp`). */
export function isKnownPadChord(chord: unknown): boolean {
  if (typeof chord !== 'string') return false
  return PAD_CODES.has(padCodeOfChord(chord)) && chord !== SELF_CHORD
}

/** The chord a pad press makes: the modifier only counts for codes other than itself. */
export function padChordOf(code: string, isModifierHeld: boolean): string {
  return isModifierHeld && code !== PAD_MODIFIER ? `${MODIFIER_PREFIX}${code}` : code
}

/** The chord without its modifier. */
export function padCodeOfChord(chord: string): string {
  return chord.startsWith(MODIFIER_PREFIX) ? chord.slice(MODIFIER_PREFIX.length) : chord
}

/** What the player reads for a pad chord: `PadRS` is `R-stick click`, `PadLB+PadUp` `LB+D-pad up`. */
export function padLabelOf(chord: string): string {
  const code = padCodeOfChord(chord)
  const modifier = code === chord ? '' : `${PAD_LABELS[PAD_MODIFIER]}${CHORD_JOIN}`
  return `${modifier}${PAD_LABELS[code] ?? code}`
}
