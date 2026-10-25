/**
 * The solar-systems slice's public API (feature-slices.md 2.1; ticket 775 under spec #774): the
 * archetype palette every system past the first is drawn from, and the roster it draws for a system
 * by seed, the art of its looks (ticket 778), the SS2-B families' behaviour ledger and copy
 * (ticket 780), each drawn planet's economy row (ticket 776) and its generated material pool
 * (ticket 777) with system 1's from P6 (ticket 888), and the money a player reads on each planet
 * through the #681 formatter (ticket 779). Types, pure selectors and constants only; never React, zustand or a store.
 * Horizontal content with no stats.json row (HS input on #775): only the jump drive has one.
 */
export const SOLAR_SYSTEMS_SLICE_ID = 'solar-systems'

export type {
  ArchetypePalette,
  BehaviourEffect,
  BiomeLook,
  FamilyBehaviour,
  FamilyCopy,
  NameParts,
  NeverBehaviour,
  NewContentFamily,
  NewContentKind,
  NewContentSet,
  RigPart,
  SizeClass,
  SizeClasses,
} from './systems/paletteRows'
export type { FirstSystemBehaviour } from './systems/familyBehaviours'
export {
  FIRST_SYSTEM_BEHAVIOURS,
  recolouredFamiliesOf,
  recolourProblemsOf,
  telegraphTicksOf,
} from './systems/familyBehaviours'
export type { EconomyRowRules } from './systems/economyRules'
export { ECONOMY_ROW_RULES } from './systems/economyRules'
export type { EconomyRowText, PlanetEconomyRow } from './systems/economyRows'
export { economyRowTextOf, planetEconomyRowOf, systemEconomyRowsOf } from './systems/economyRows'
export { economyRowProblemsOf } from './systems/economyRowGuards'
export type { MaterialPool, PoolKind } from './systems/materialPool'
export { planetMaterialPoolOf, systemMaterialPoolsOf } from './systems/materialPool'
export {
  firstSystemPoolOf,
  lookGroupOf,
  lookGroupPoolsOf,
  materialPoolAt,
  poolOreValueAt,
} from './systems/firstSystemPools'
export { materialPoolProblemsOf } from './systems/materialPoolGuards'
export type { MaterialPoolRules } from './systems/materialPoolRules'
export { MATERIAL_POOL_RULES } from './systems/materialPoolRules'
export { recolouredKindProblemsOf } from './systems/poolRecolour'
export { planetRecolourProblemsOf, systemRecolourProblemsOf } from './systems/planetRecolour'
export type { CopyFill, SlotCopy } from './systems/familyCopy'
export { familyCopyFor, filledCopyOf, slotCopyOf } from './systems/familyCopy'
export { NAME_WORDS_MAX, TAG_CHARACTERS_MAX } from './systems/familyGuards'
export { ARCHETYPE_PALETTE, mixedActIds } from './systems/paletteRows'
export { paletteProblems } from './systems/paletteGuards'
export type { PlanetMoneyTexts } from './systems/systemMoneyTexts'
export { systemMoneyTextsOf } from './systems/systemMoneyTexts'
export type { PlanetId, RosterPlanet, SurfaceStart } from './systems/systemRoster'
export { rosterPlanetOf, systemRosterOf } from './systems/systemRoster'
export { FIRST_DRAWN_SYSTEM, planetsPerSystem } from './systems/newContentSlots'
export type { LookArt } from './systems/render/lookArt'
export { lookArtOf, lookTileAssetIdOf } from './systems/render/lookArt'
export type { LookReads, LookSheetRow } from './systems/render/lookContactSheet'
export { lookContactSheetOf, unreadableLookPairsOf } from './systems/render/lookContactSheet'
