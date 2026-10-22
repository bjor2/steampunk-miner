/**
 * Hands the local player's first contacts with a species (`speciesRevealsBetween`, ticket 698) to
 * whoever shows them: the terrain's rarity flourish and its spark, and the sound stage's chime
 * through a feedback cue. The store calls `followSpeciesReveals` with every batch it follows, and
 * `watchSpeciesRevealsFromNow` when it connects a fresh or restored session; an empty batch (a
 * restored session catching up) only notes the state, so a loaded save flourishes nothing it had
 * met. Shaped like
 * `carveCompleteBroadcast.ts`: listeners only present, never write the store or submit, so a
 * reveal changes no state or digest. The watch is the one writer of its module state.
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { kindLookProvider } from '../systems/registries/kindLook'
import { speciesRevealsBetween, type SpeciesReveal } from '../systems/render/speciesReveal'
import { readAuthorityState } from './authorityLink'
import { announceFeedbackCue } from './feedbackBroadcast'

export type SpeciesRevealListener = (reveal: SpeciesReveal) => void

const listeners = new Set<SpeciesRevealListener>()
let watched: AuthorityState | null = null

/** Returns the call that stops listening. */
export function listenForSpeciesReveals(listener: SpeciesRevealListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A new or restored session compares with itself as connected, never with the last one. */
export function watchSpeciesRevealsFromNow(): void {
  watched = readAuthorityState()
}

/** One answered batch: each species it let the player meet chimes and goes to the listeners. */
export function followSpeciesReveals(events: readonly DomainEvent[], playerId: string): void {
  const now = readAuthorityState()
  const reveals = events.length === 0 ? [] : revealsSince(watched, now, playerId)
  watched = now
  reveals.forEach(announceReveal)
}

function revealsSince(
  before: AuthorityState | null,
  after: AuthorityState,
  playerId: string,
): SpeciesReveal[] {
  const provider = kindLookProvider()
  if (before === null || provider === null) return []
  return speciesRevealsBetween(before, after, playerId, provider)
}

function announceReveal(reveal: SpeciesReveal): void {
  announceFeedbackCue({ kind: 'speciesReveal', rarityLead: reveal.rarityLead })
  listeners.forEach((listener) => listener(reveal))
}
