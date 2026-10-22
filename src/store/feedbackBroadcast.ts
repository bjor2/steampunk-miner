/**
 * Hands the local player's feedback cues (`feedbackCuesOf`) to whoever shows or plays them: the
 * scene's shake and flash, the sound stage. The store calls `announceFeedback` with every batch of
 * authority events it follows; listeners only present, they never write the store or submit, so
 * no cue can change state or the digest (#33). A plain listener set, not store state, because
 * cues are moments, not something the UI renders.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import { cueSightOf, feedbackCuesOf, type FeedbackCue } from '../systems/feedback/feedbackCues'
import { readAuthorityState } from './authorityLink'

export type FeedbackListener = (cue: FeedbackCue) => void

const listeners = new Set<FeedbackListener>()

/** Returns the call that stops listening. */
export function listenForFeedback(listener: FeedbackListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A cue the store reads off state rather than events: a species met for the first time (#698). */
export function announceFeedbackCue(cue: FeedbackCue): void {
  listeners.forEach((listener) => listener(cue))
}

/**
 * A blast kicks by how far the local vehicle stands from it (#213), and a hit flashes the side its
 * enemy stands on (ticket 720), so cues read the pose and the enemies.
 */
export function announceFeedback(events: readonly DomainEvent[], playerId: string): void {
  if (listeners.size === 0) return
  feedbackCuesOf(events, playerId, cueSightOf(readAuthorityState(), playerId)).forEach((cue) =>
    listeners.forEach((listener) => listener(cue)),
  )
}
