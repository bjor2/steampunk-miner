/** The ground's `debug.*` command intents (#36), built in one place for the store and the API. */
import type { CommandIntent } from './authorityCommand'

/** A disc in mm round a world point, and how much density to take or give, 0 to 255. */
export interface GroundCircle {
  x: number
  y: number
  radius: number
  amount: number
}

export function carveCircleCommand(circle: GroundCircle): CommandIntent<'debug.carveCircle'> {
  return { type: 'debug.carveCircle', payload: { ...circle } }
}

export function fillCircleCommand(circle: GroundCircle): CommandIntent<'debug.fillCircle'> {
  return { type: 'debug.fillCircle', payload: { ...circle } }
}
