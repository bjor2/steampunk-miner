/**
 * A planet's material roster (TD ruling on ticket 446, 6226236698 section 2): the ordered kind
 * slots its patches draw from, a pure function of the planet's params. A cell stores its roster
 * index plus one (`kindSlotOfCell`), and a species is found from the slot's descriptor, never from
 * the stored number, so adding rows never renumbers a cell.
 *
 * A planet draws the kinds of the rarity row set it draws its rarity from (`legacy` on P1 and P2,
 * `mixed` from P3; Systems' table order, not seed dependent). Only a planet entered under ore rules
 * 2 or later has a roster: a planet a save holds without them, or under rules 1, keeps the cells it
 * was generated with (HS condition c). Look only: horizontal, no price, gate or income reads it.
 */
import { ORE_ROWS, rarityRowSetOfPlanet, type KindSlot } from '../../ores'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { NO_KIND_SLOT } from '../../../systems/world/worldCell'

/** The ore rules version that brought the roster (ticket 446): 1 was the rarity rows alone. */
export const ROSTER_ORE_RULES = 2

const NO_KINDS: readonly KindSlot[] = Object.freeze([])

/** The kinds a planet's patches draw from, in roster order; empty before the roster's rules. */
export function planetRosterOf(params: PlanetParams): readonly KindSlot[] {
  if (!hasRoster(params)) return NO_KINDS
  return ORE_ROWS.kinds.slotsBySet[rarityRowSetOfPlanet(params)]
}

/** The kind a cell wears on its planet, from the slot it stores; null for none. */
export function rosterKindOf(params: PlanetParams, kindSlot: number): KindSlot | null {
  if (kindSlot === NO_KIND_SLOT) return null
  return planetRosterOf(params)[kindSlot - 1] ?? null
}

function hasRoster(params: PlanetParams): boolean {
  return (params.oreRulesVersion ?? 0) >= ROSTER_ORE_RULES
}
