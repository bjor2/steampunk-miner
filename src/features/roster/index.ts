/**
 * The roster slice's public API (feature-slices.md 2.1, ticket 446 under #139): each planet's
 * material roster, the species pool it resolves to (ticket 542) and the generation fold that draws
 * a kind per ore patch. Types, pure selectors and constants only; never React, zustand or a store.
 * The kind slots and the planet-to-pool table are ores data (`ores.economy.json` `kinds`); the
 * species rows bind to them in the materials slice's tickets.
 */
export const ROSTER_SLICE_ID = 'roster'

export {
  MIXED_ROSTER_ORE_RULES,
  planetRosterOf,
  poolOfPlanet,
  ROSTER_ORE_RULES,
  rosterKindOf,
} from './systems/planetRoster'
export { planetSpeciesOf, speciesOfKind } from './systems/planetSpecies'
export { kindSlotOfPatch, liveRosterIndicesOf, ROSTER_HOOK_ID } from './systems/rosterFold'
