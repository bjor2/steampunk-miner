/**
 * One accent per moment (#48 motion principle 4): of the big effects (spark burst, steam burst,
 * bloom flash) each event fires at most one, so the screen never stacks them. Today only the
 * bloom flash exists as an event effect (the drill's sparks are continuous, not an event); a
 * steam burst or a spark burst joins by taking a cue's slot here, never by adding a second.
 */
import type { FeedbackCue } from './feedbackCues'

export type Accent = 'sparkBurst' | 'steamBurst' | 'bloomFlash'

export const ACCENT_OF_CUE: Readonly<Record<FeedbackCue['kind'], Accent | null>> = {
  pickup: null,
  dockClank: null,
  upgradeClank: null,
  hit: 'bloomFlash',
  destroyed: 'bloomFlash',
  coreStinger: 'bloomFlash',
  travelStinger: null,
}

export function accentOf(cue: FeedbackCue): Accent | null {
  return ACCENT_OF_CUE[cue.kind]
}
