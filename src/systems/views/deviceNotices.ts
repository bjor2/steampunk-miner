/**
 * The device's notice chips (#470 P1-7, ticket 478): what the browser took away and the player can
 * see coming back. "Reconnecting" while the canvas has lost its WebGL context (the step holds
 * until it is restored), "Tap for sound" while a gesture left the audio context suspended. Each is
 * a Title+OneLine text the stage draws; the list is empty while nothing is missing.
 */
import { isTapForSoundShown, type SoundUnlock } from '../audio/soundUnlock'
import type { ElementText } from './uiText'

export interface DeviceSituation {
  isRenderContextLost: boolean
  soundUnlock: SoundUnlock
}

export const RECONNECTING_TEXT: ElementText = {
  id: 'device.reconnecting',
  title: 'Reconnecting',
  oneLine: 'The picture is back in a moment.',
  tooltipLines: [],
}

export const TAP_FOR_SOUND_TEXT: ElementText = {
  id: 'device.tap-for-sound',
  title: 'Tap for sound',
  oneLine: '',
  tooltipLines: [],
}

/** Reconnecting first: while the picture is gone, sound is the lesser loss. */
export function deviceNoticesOf(situation: DeviceSituation): ElementText[] {
  return [
    ...(situation.isRenderContextLost ? [RECONNECTING_TEXT] : []),
    ...(isTapForSoundShown(situation.soundUnlock) ? [TAP_FOR_SOUND_TEXT] : []),
  ]
}
