/**
 * The keyboard keys a binding may name (#33 section 2): `KeyboardEvent.code` values, so a binding
 * is a physical key and works on any layout, plus a `Shift+` chord for `Shift+Tab`. Labels fall
 * back to the code when the browser gives no layout map; the shell can add that later without
 * changing a binding.
 */

const SHIFT_PREFIX = 'Shift+'

const LETTER_CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`)
const DIGIT_CODES = '0123456789'.split('').map((digit) => `Digit${digit}`)
const NUMPAD_CODES = '0123456789'.split('').map((digit) => `Numpad${digit}`)
const FUNCTION_CODES = Array.from({ length: 12 }, (_, index) => `F${index + 1}`)

/** Keys with a label that is not the code with its prefix dropped. */
const NAMED_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: 'Backspace',
  Tab: 'Tab',
  ShiftLeft: 'Left Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt',
  AltRight: 'Right Alt',
  CapsLock: 'Caps Lock',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadDecimal: 'Num .',
  NumpadEnter: 'Num Enter',
}

const KEY_CODES: ReadonlySet<string> = new Set([
  ...LETTER_CODES,
  ...DIGIT_CODES,
  ...NUMPAD_CODES,
  ...FUNCTION_CODES,
  ...Object.keys(NAMED_LABELS),
])

/** A key code (`KeyA`) or a Shift chord of one (`Shift+Tab`). */
export function isKnownKeyChord(chord: unknown): boolean {
  if (typeof chord !== 'string') return false
  return KEY_CODES.has(chord.startsWith(SHIFT_PREFIX) ? chord.slice(SHIFT_PREFIX.length) : chord)
}

/** The chord a key press makes: Shift only counts for keys that are not Shift themselves. */
export function chordOf(code: string, isShiftHeld: boolean): string {
  return isShiftHeld && !code.startsWith('Shift') ? `${SHIFT_PREFIX}${code}` : code
}

/** The chord without its Shift: a released key releases whatever chord it was pressed in. */
export function keyOfChord(chord: string): string {
  return chord.startsWith(SHIFT_PREFIX) ? chord.slice(SHIFT_PREFIX.length) : chord
}

/** What the player reads for a chord: `KeyJ` is `J`, `Shift+Tab` is `Shift+Tab`. */
export function keyLabelOf(chord: string): string {
  const key = keyOfChord(chord)
  const shift = key === chord ? '' : SHIFT_PREFIX
  return `${shift}${labelOfKey(key)}`
}

function labelOfKey(code: string): string {
  if (Object.hasOwn(NAMED_LABELS, code)) return NAMED_LABELS[code]
  if (code.startsWith('Key')) return code.slice('Key'.length)
  if (code.startsWith('Digit')) return code.slice('Digit'.length)
  if (code.startsWith('Numpad')) return `Num ${code.slice('Numpad'.length)}`
  return code
}
