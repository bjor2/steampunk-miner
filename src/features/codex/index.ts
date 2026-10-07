/**
 * The codex slice's public API (feature-slices.md 2.1): what another slice may import from this
 * folder. Types, pure read selectors and constants; never React, zustand or a store object. The
 * tech tree asks the kernel `hasDiscovered` instead and never imports the codex.
 */
export const CODEX_SLICE_ID = 'codex'
export type { CodexStage, ContactRoute, OreFacts } from './systems/codexEvents'
export type { CodexSection, IdDiscoveries, OreDiscoveries } from './systems/codexSection'
export { CODEX_SECTION_ID } from './systems/codexSection'
export { codexOf, hasContacted, hasMinedOre } from './systems/codexReads'

/** The codex's run events, for listeners and specs. */
export const CODEX_RUN_EVENT_NAMES = [
  'codex.entry_added',
  'codex.ore_contacted',
  'codex.ore_discovered',
] as const
