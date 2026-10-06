/**
 * The haptics (#173, Gameplay & Vehicle): a 10 ms tick each time the drill bites (one per drill
 * report while it cuts) and a 30 ms pulse when the hull takes damage or the rig is destroyed.
 * Felt only: the cue still sounds and shows as before.
 */
import { HAPTIC_DRILL_MS, HAPTIC_HIT_MS } from '../../constants/touch'
import type { FeedbackCue } from './feedbackCues'

const PULSE_MS: Readonly<Partial<Record<FeedbackCue['kind'], number>>> = {
  drillContact: HAPTIC_DRILL_MS,
  hit: HAPTIC_HIT_MS,
  destroyed: HAPTIC_HIT_MS,
}

/** How long the motor buzzes for this cue, or null when the cue is not felt. */
export function hapticPulseMsOf(cue: FeedbackCue): number | null {
  return PULSE_MS[cue.kind] ?? null
}
