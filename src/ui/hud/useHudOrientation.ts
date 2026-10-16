/**
 * The way up the layout shell last fitted the screen in (ticket 483), for the HUD's upright rows
 * (#486): `landscape` until the first fit and on a server render, as the density defaults to full.
 */
import { useSyncExternalStore } from 'react'
import type { StageOrientation } from '../../systems/views/screenLayout'
import { readFittedScreen, subscribeFittedScreen } from '../stage/screenFit'

export function useHudOrientation(): StageOrientation {
  return useSyncExternalStore(subscribeFittedScreen, readHudOrientation, readLandscape)
}

function readHudOrientation(): StageOrientation {
  return readFittedScreen()?.orientation ?? 'landscape'
}

function readLandscape(): StageOrientation {
  return 'landscape'
}
