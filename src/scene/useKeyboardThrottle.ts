import { useEffect, useRef, type MutableRefObject } from 'react'
import { getShell } from '../shell/shell'
import { throttleFromKeys } from '../systems/throttleFromKeys'

/** The held-key throttle, kept in a ref: it changes with input, not per render. */
export function useKeyboardThrottle(): MutableRefObject<number> {
  const throttle = useRef(0)
  useEffect(() => {
    const pressed = new Set<string>()
    return getShell().onKeyChange((code, isDown) => {
      recordKey(pressed, code, isDown)
      throttle.current = throttleFromKeys(pressed)
    })
  }, [])
  return throttle
}

function recordKey(pressed: Set<string>, code: string, isDown: boolean): void {
  if (isDown) pressed.add(code)
  else pressed.delete(code)
}
