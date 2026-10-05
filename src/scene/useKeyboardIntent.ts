import { useEffect, useRef, type MutableRefObject } from 'react'
import { getShell } from '../shell/shell'
import {
  ACTION_MAP,
  actionsOfChord,
  defaultBindings,
  type ActionId,
} from '../systems/input/actionMap'
import { buildIntent } from '../systems/input/buildIntent'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'

const BINDINGS = defaultBindings(ACTION_MAP)

/**
 * The vehicle intent from the held keys' actions, kept in a ref: it changes with input, not per
 * render. Actions are kept in press order, so the latest pushed aim wins (#7).
 */
export function useKeyboardIntent(): MutableRefObject<VehicleIntent> {
  const intent = useRef<VehicleIntent>(IDLE_INTENT)
  useEffect(() => {
    const held: ActionId[] = []
    return getShell().onKeyChange((code, isDown) => {
      for (const action of actionsOfChord(ACTION_MAP, BINDINGS, 'vehicle', code)) {
        recordAction(held, action, isDown)
      }
      intent.current = buildIntent(held)
    })
  }, [])
  return intent
}

/** An action pressed again moves to the end: it is the latest push. */
function recordAction(held: ActionId[], action: ActionId, isDown: boolean): void {
  const index = held.indexOf(action)
  if (index >= 0) held.splice(index, 1)
  if (isDown) held.push(action)
}
