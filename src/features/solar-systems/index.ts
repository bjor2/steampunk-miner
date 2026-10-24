/**
 * The solar-systems slice's public API (feature-slices.md 2.1; ticket 775 under spec #774): the
 * archetype palette every system past the first is drawn from, and the roster it draws for a system
 * by seed. Types, pure selectors and constants only; never React, zustand or a store. Horizontal
 * content with no stats.json row (HS input on #775): only the jump drive has one.
 */
export const SOLAR_SYSTEMS_SLICE_ID = 'solar-systems'

export type {
  ArchetypePalette,
  BiomeLook,
  NameParts,
  NewContentFamily,
  NewContentKind,
  NewContentSet,
  SizeClass,
  SizeClasses,
} from './systems/paletteRows'
export { ARCHETYPE_PALETTE, mixedActIds } from './systems/paletteRows'
export { paletteProblems } from './systems/paletteGuards'
export type { PlanetId, RosterPlanet, SurfaceStart } from './systems/systemRoster'
export { rosterPlanetOf, systemRosterOf } from './systems/systemRoster'
export { FIRST_DRAWN_SYSTEM, planetsPerSystem } from './systems/newContentSlots'
