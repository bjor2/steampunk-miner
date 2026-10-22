/**
 * The first-contact flourishes started since the page loaded (ticket 698): how many, and the
 * species and roster slot of the last, read by the terrain to start its rarity rise and by
 * `steampunkDebug.ui.getKindLooks()` so a spec sees one flourish per species. Written only by
 * `terrainRarityReveal`'s reveal listener; a mutable registry, never React or the store.
 */
export const speciesRevealPresence: {
  fired: number
  lastSlot: number
  lastSpeciesId: string | null
} = {
  fired: 0,
  lastSlot: 0,
  lastSpeciesId: null,
}
