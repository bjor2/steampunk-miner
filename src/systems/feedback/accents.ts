/**
 * One accent per moment (#48 motion principle 4): of the big effects (spark burst, steam burst,
 * bloom flash) each event fires at most one, so the screen never stacks them. Today only the
 * bloom flash exists as an event effect (the drill's sparks are continuous, not an event); a
 * steam burst or a spark burst joins by taking a cue's slot here, never by adding a second.
 *
 * A hit (ticket 720) takes its accent from where it came from: frontal drill contact the spark
 * burst at the nose, a side or rear hit the red flash on its edge, a hit from everywhere (a
 * collapse, a blast, heat, lava) the bloom flash `ACCENT_OF_CUE` names.
 */
import type { FeedbackCue } from './feedbackCues'
import type { HitFrom } from './hitFrom'

export type Accent = 'sparkBurst' | 'steamBurst' | 'bloomFlash' | 'edgeFlash'

export const ACCENT_OF_CUE: Readonly<Record<FeedbackCue['kind'], Accent | null>> = {
  pickup: null,
  dockClank: null,
  upgradeClank: null,
  // A hit from everywhere; an aimed hit's accent is `ACCENT_OF_HIT`'s.
  hit: 'bloomFlash',
  destroyed: 'bloomFlash',
  coreStinger: 'bloomFlash',
  travelStinger: null,
  casingHiss: null,
  casingPop: null,
  // The crush that may follow is a hit, which already takes the flash.
  collapseRumble: null,
  collapseCrash: null,
  wreckerScrape: null,
  // A planter caught in its own blast takes a hit, which already takes the flash.
  chargeBlast: null,
  // Felt in the hand only (#173 haptics).
  drillContact: null,
  holdCancelled: null,
  holdFinished: null,
  // The tracer's spark is the slice's (#314), drawn from the debris allowance.
  boreClank: null,
  autoValveClick: null,
  // Its spark and rarity flourish are drawn on the cell itself (#698).
  speciesReveal: null,
}

const ACCENT_OF_HIT: Readonly<Record<HitFrom['kind'], Accent>> = {
  drillFace: 'sparkBurst',
  bearing: 'edgeFlash',
  everywhere: 'bloomFlash',
}

export function accentOf(cue: FeedbackCue): Accent | null {
  return cue.kind === 'hit' ? ACCENT_OF_HIT[cue.from.kind] : ACCENT_OF_CUE[cue.kind]
}
