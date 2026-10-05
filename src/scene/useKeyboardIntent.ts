import { useEffect, useRef, type MutableRefObject } from 'react'
import { getShell } from '../shell/shell'
import {
  IDLE_INTENT,
  intentFromHeldKeys,
  type VehicleIntent,
} from '../systems/vehicle/vehicleIntent'

/**
 * The vehicle intent from the held keys, kept in a ref: it changes with input, not per render.
 * Keys are kept in press order, so the latest pushed aim wins (#7).
 */
export function useKeyboardIntent(): MutableRefObject<VehicleIntent> {
  const intent = useRef<VehicleIntent>(IDLE_INTENT)
  useEffect(() => {
    const held: string[] = []
    return getShell().onKeyChange((code, isDown) => {
      recordKey(held, code, isDown)
      intent.current = intentFromHeldKeys(held)
    })
  }, [])
  return intent
}

/** A key pressed again moves to the end: it is the latest push. */
function recordKey(held: string[], code: string, isDown: boolean): void {
  const index = held.indexOf(code)
  if (index >= 0) held.splice(index, 1)
  if (isDown) held.push(code)
}
