/**
 * One packed world cell (decision #4, Generation): `kind (4 bits) | family (4 bits) | spare (8 bits)
 * | kindSlot (8 bits) | tierOffset (8 bits)` in a uint32. Hardness is not stored; it is looked up
 * from the planet and depth when needed. Ore value comes from `tierOffset` at sell time (#4
 * consequences for #5).
 *
 * `tierOffset` is the ore tier above the planet's band-1 ore tier: ore in band `b` has offset
 * `b - 1` and core material has offset 5, because #6 sets tier `t = 3(p-1) + b` and core
 * material to `3(p-1) + 6`. #140's lead roll may lift an ore cell up to 2 tiers above its band, and
 * the mythic rarity tier (ticket 445) up to 4, so an ore offset runs from 0 to 8. Storing the offset
 * keeps every cell small for any planet index.
 *
 * `kindSlot` (TD ruling on ticket 446, addendum 6226264758 amendment 1): the material kind a patch
 * drew from its planet's roster, its roster index plus one, 0 for none. It is a look only: family,
 * tier, price and gate never read it, so every reader of the tier offset masks it away. The field
 * was the top of the old 24-bit tier offset, which never held more than 8; bits 16 to 23 stay spare.
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
  /**
   * A lava pocket of a heat planet (#113): molten rock, solid to the vehicle and the drill, which
   * flows down into open tunnels and burns what touches it.
   */
  lava: 7,
} as const

export type CellKind = (typeof CELL_KIND)[keyof typeof CELL_KIND]

/** The two resource families of the slice (#2 content budget), the ones the kernel draws itself. */
export const RESOURCE_FAMILY = { none: 0, metal: 1, crystal: 2 } as const

/**
 * Any value of the cell's 4-bit family field (#232): `none`, metal and crystal, then the codes a
 * slice's catalogue names (#141's twelve families take 1 to 12). A code is only ever placed by a
 * generation hook whose catalogue has a row for it; the rest stay spare.
 */
export type ResourceFamily = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15

/** The largest code the 4-bit family field holds. */
export const MAX_RESOURCE_FAMILY = 15

/** Core material is tier 3(p-1)+6 (#6), five above band-1 ore. */
export const CORE_TIER_OFFSET = 5

/**
 * Band-5 ore (offset 4) with the largest rarity lead, mythic's +4 (ticket 445; #140's was +2): no
 * ore cell lies higher (#223). A planet on the legacy rows never rolls above +2, so an old save
 * holds no offset past 6.
 */
export const MAX_ORE_TIER_OFFSET = 8

/** No material kind: a cell no roster fold drew on, or one generated before the roster. */
export const NO_KIND_SLOT = 0

/** The largest value the 8-bit kind slot holds: roster index 254. */
export const MAX_KIND_SLOT = 0xff

const KIND_SHIFT = 28
const FAMILY_SHIFT = 24
const KIND_SLOT_SHIFT = 8
const NIBBLE = 0xf
const BYTE = 0xff
const TIER_OFFSET_MASK = BYTE
const KIND_SLOT_MASK = BYTE << KIND_SLOT_SHIFT

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

/** The cell's material kind: its roster index plus one, `NO_KIND_SLOT` for none (ticket 446). */
export function kindSlotOfCell(cell: number): number {
  return (cell >>> KIND_SLOT_SHIFT) & BYTE
}

/** The cell with its kind slot set; every other field is kept. */
export function withKindSlot(cell: number, kindSlot: number): number {
  return ((cell & ~KIND_SLOT_MASK) | ((kindSlot & BYTE) << KIND_SLOT_SHIFT)) >>> 0
}

/** The cell as a reader of family, tier and gate sees it: the look's kind slot cleared. */
export function withoutKindSlot(cell: number): number {
  return withKindSlot(cell, NO_KIND_SLOT)
}

export const SPACE_CELL = packCell(CELL_KIND.space, RESOURCE_FAMILY.none, 0)
export const AIR_CELL = packCell(CELL_KIND.air, RESOURCE_FAMILY.none, 0)
export const GROUND_CELL = packCell(CELL_KIND.ground, RESOURCE_FAMILY.none, 0)
export const CORE_CELL = packCell(CELL_KIND.core, RESOURCE_FAMILY.none, CORE_TIER_OFFSET)
export const INDESTRUCTIBLE_CELL = packCell(CELL_KIND.indestructible, RESOURCE_FAMILY.none, 0)
export const ARTEFACT_CACHE_CELL = packCell(CELL_KIND.artefactCache, RESOURCE_FAMILY.none, 0)
export const LAVA_CELL = packCell(CELL_KIND.lava, RESOURCE_FAMILY.none, 0)

export function oreCell(
  family: ResourceFamily,
  tierOffset: number,
  kindSlot: number = NO_KIND_SLOT,
): number {
  return withKindSlot(packCell(CELL_KIND.ore, family, tierOffset), kindSlot)
}

/** Nothing to collide with or stand on: space or air (#9 uses this for the enemy grid). */
export function isAirCell(cell: number): boolean {
  const kind = kindOfCell(cell)
  return kind === CELL_KIND.space || kind === CELL_KIND.air
}

export function isSolidCell(cell: number): boolean {
  return !isAirCell(cell)
}

/** A drill may remove it: solid, and neither the dock pad (#4 acceptance 4) nor lava (#113). */
export function isRemovableCell(cell: number): boolean {
  const kind = kindOfCell(cell)
  return isSolidCell(cell) && kind !== CELL_KIND.indestructible && kind !== CELL_KIND.lava
}

export function isLavaCell(cell: number): boolean {
  return kindOfCell(cell) === CELL_KIND.lava
}
