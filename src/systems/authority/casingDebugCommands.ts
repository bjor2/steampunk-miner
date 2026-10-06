/** The casing's `debug.*` command intents (#41, #111), built in one place for the store and the API. */
import type { CommandIntent } from './authorityCommand'

/** A ring of lining centred on `(x, y)` mm, at `grade`. */
export interface CasingRingAt {
  x: number
  y: number
  grade: number
}

export function setCasingGradeCommand(grade: number): CommandIntent<'debug.setCasingGrade'> {
  return { type: 'debug.setCasingGrade', payload: { grade } }
}

export function lineCasingCommand(ring: CasingRingAt): CommandIntent<'debug.lineCasing'> {
  return { type: 'debug.lineCasing', payload: { ...ring } }
}

/** The ring round `(x, y)` mm breached, as a tunnel wrecker leaves it (#111). */
export function gnawCasingCommand(x: number, y: number): CommandIntent<'debug.gnawCasing'> {
  return { type: 'debug.gnawCasing', payload: { x, y } }
}
