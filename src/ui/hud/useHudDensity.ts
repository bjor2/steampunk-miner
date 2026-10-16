/**
 * The HUD's density as the layout shell last fitted it (#500): `full` until the first fit and on
 * a server render, so the desktop HUD is the default and a spec picks its density by prop.
 */
import { useSyncExternalStore } from 'react'
import type { HudDensity } from '../../systems/views/screenLayout'
import { readFittedScreen, subscribeFittedScreen } from '../stage/screenFit'

export function useHudDensity(): HudDensity {
  return useSyncExternalStore(subscribeFittedScreen, readHudDensity, readFullDensity)
}

function readHudDensity(): HudDensity {
  return readFittedScreen()?.hudDensity ?? 'full'
}

function readFullDensity(): HudDensity {
  return 'full'
}
