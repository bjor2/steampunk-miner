/**
 * One packed world cell (decision #4, Generation): `kind (4 bits) | family (4 bits) |
 * tierOffset (24 bits)` in a uint32. Hardness is not stored; it is looked up from the planet and
 * depth when needed. Ore value comes from `tierOffset` at sell time (#4 consequences for #5).
 *
 * `tierOffset` is the ore tier above the planet's band-1 ore tier: ore in band `b` has offset
 * `b - 1` and core material has offset 5, because #6 sets tier `t = 3(p-1) + b` and core
 * material to `3(p-1) + 6`. Storing the offset keeps every cell small for any planet index.
 */

export const CELL_KIND = {
  /** Outside the disc. */
  space: 0,
  /** Inside the disc and empty: a cave, the dock clearance, or a removed tile. */
  air: 1,
  /** Plain rock and soil with nothing to collect. */
  ground: 2,
  ore: 3,
  core: 4,
  /** The dock pad (#8): can never be removed. */
  indestructible: 5,
  /** The planet's artefact cache (#46): drills like rock and yields nothing. */
  artefactCache: 6,
} as const

export type CellKind = (typeof CELL_KIND)[keyof typeof CELL_KIND]

/** The two resource families of the slice (#2 content budget). */
export const RESOURCE_FAMILY = { none: 0, metal: 1, crystal: 2 } as const

export type ResourceFamily = (typeof RESOURCE_FAMILY)[keyof typeof RESOURCE_FAMILY]

/** Core material is tier 3(p-1)+6 (#6), five above band-1 ore. */
export const CORE_TIER_OFFSET = 5

const KIND_SHIFT = 28
const FAMILY_SHIFT = 24
const NIBBLE = 0xf
const TIER_OFFSET_MASK = 0xffffff

export function packCell(kind: CellKind, family: ResourceFamily, tierOffset: number): number {
  return ((kind << KIND_SHIFT) | (family << FAMILY_SHIFT) | (tierOffset & TIER_OFFSET_MASK)) >>> 0
}

export function kindOfCell(cell: number): CellKind {
  return ((cell >>> KIND_SHIFT) & NIBBLE) as CellKind
}

export function familyOfCell(cell: number): ResourceFamily {
  return ((cell >>> FAMILY_SHIFT) & NIBBLE) as ResourceFamily
}

export function tierOffsetOfCell(cell: number): number {
  return cell & TIER_OFFSET_MASK
}

export const SPACE_CELL = packCell(CELL_KIND.space, RESOURCE_FAMILY.none, 0)
export const AIR_CELL = packCell(CELL_KIND.air, RESOURCE_FAMILY.none, 0)
export const GROUND_CELL = packCell(CELL_KIND.ground, RESOURCE_FAMILY.none, 0)
export const CORE_CELL = packCell(CELL_KIND.core, RESOURCE_FAMILY.none, CORE_TIER_OFFSET)
export const INDESTRUCTIBLE_CELL = packCell(CELL_KIND.indestructible, RESOURCE_FAMILY.none, 0)
export const ARTEFACT_CACHE_CELL = packCell(CELL_KIND.artefactCache, RESOURCE_FAMILY.none, 0)

export function oreCell(family: ResourceFamily, tierOffset: number): number {
  return packCell(CELL_KIND.ore, family, tierOffset)
}

/** Nothing to collide with or stand on: space or air (#9 uses this for the enemy grid). */
export function isAirCell(cell: number): boolean {
  const kind = kindOfCell(cell)
  return kind === CELL_KIND.space || kind === CELL_KIND.air
}

export function isSolidCell(cell: number): boolean {
  return !isAirCell(cell)
}

/** A drill may remove it: solid, and not the dock pad (#4 acceptance 4). */
export function isRemovableCell(cell: number): boolean {
  return isSolidCell(cell) && kindOfCell(cell) !== CELL_KIND.indestructible
}
