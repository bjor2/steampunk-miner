/**
 * Whether the terrain binds the resident act's synthetic overflow (ticket 852,
 * `overflowedHeroAtlasOf`): off in every run until the debug API's `ui.packHeroAtlasOverflow(true)`
 * turns it on, so a browser spec and the eye check see a hero drawn from page 2 before any act
 * fills page 1. Never saved, logged or replayed; `HeroAtlas` reads it through
 * `subscribeHeroAtlasOverflow` (`useSyncExternalStore`'s shape). Presentation only.
 */
let isPacked = false
const listeners = new Set<() => void>()

export function packHeroAtlasOverflow(packed: boolean): void {
  isPacked = packed
  listeners.forEach((listener) => listener())
}

export function isHeroAtlasOverflowPacked(): boolean {
  return isPacked
}

/** Calls `listener` after every switch; returns the unsubscribe. */
export function subscribeHeroAtlasOverflow(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
