/**
 * The roster slice's public API (feature-slices.md 2.1, ticket 446 under #139): each planet's
 * material roster and the generation fold that draws a kind per ore patch. Types, pure selectors
 * and constants only; never React, zustand or a store. The kind slots themselves are ores data
 * (`ores.economy.json` `kinds`); the species rows bind to them in the materials slice's tickets.
 */
export const ROSTER_SLICE_ID = 'roster'

export { planetRosterOf, ROSTER_ORE_RULES, rosterKindOf } from './systems/planetRoster'
export { kindSlotOfPatch, liveRosterIndicesOf, ROSTER_HOOK_ID } from './systems/rosterFold'
