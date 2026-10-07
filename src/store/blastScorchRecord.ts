/**
 * Where the planet's last blasts went off (#109 "the blast leaves scorch marks on the tunnel
 * edge"), for the scene's scorch shader. A plain list, not store state: the scorch is drawn every
 * frame and never rendered through React, and only the presentation reads it, so nothing here can
 * change state or the digest. `resetGameStore` forgets it with the run; arriving on a planet
 * clears it (`scorchesAfter`).
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import { scorchesAfter, type ChargePlacement } from '../systems/render/chargePlacement'

let scorches: readonly ChargePlacement[] = []

export function recordBlastScorches(events: readonly DomainEvent[]): void {
  scorches = scorchesAfter(scorches, events)
}

/** The scorches now, oldest first. */
export function readBlastScorches(): readonly ChargePlacement[] {
  return scorches
}

export function forgetBlastScorches(): void {
  scorches = []
}
