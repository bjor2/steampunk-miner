/**
 * A blast's sound waiting for its thump (#213): the blast cue's provider may delay it with the
 * listener's distance, `thumpDelayTicks` of the authority's 1/60 s ticks, counted down on the
 * render delta like any presentation, so it lands the same at any frame rate. A cue with no delay
 * sounds at once, exactly as before. Counted down in place, so a frame allocates nothing.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { FeedbackCue } from '../feedback/feedbackCues'

/** Frame deltas summed in floats land a hair short of a whole delay; that hair is due already. */
const DUE_SLACK_SECONDS = 1e-9

export interface DelayedThumps {
  /** Seconds until each queued thump sounds. */
  secondsLeft: number[]
}

export function createDelayedThumps(): DelayedThumps {
  return { secondsLeft: [] }
}

/** How many ticks a cue's sound waits: only a charge's blast ever does. */
export function thumpDelayTicksOf(cue: FeedbackCue): number {
  return cue.kind === 'chargeBlast' ? cue.kick.thumpDelayTicks : 0
}

export function delayThump(thumps: DelayedThumps, delayTicks: number): void {
  thumps.secondsLeft.push(delayTicks / TICKS_PER_SECOND)
}

/** Counts every queued thump down by `dt`; returns how many came due and drops them. */
export function takeDueThumps(thumps: DelayedThumps, dt: number): number {
  const left = thumps.secondsLeft
  let kept = 0
  for (let index = 0; index < left.length; index++) {
    const seconds = left[index] - dt
    if (seconds > DUE_SLACK_SECONDS) left[kept++] = seconds
  }
  const due = left.length - kept
  left.length = kept
  return due
}
