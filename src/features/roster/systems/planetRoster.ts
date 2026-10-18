/**
 * A planet's material roster (TD ruling on ticket 446, 6226236698 section 2): the ordered kind
 * slots its patches draw from, a pure function of the planet's params. A cell stores its roster
 * index plus one (`kindSlotOfCell`), and a species is found from the slot's descriptor, never from
 * the stored number, so adding rows never renumbers a cell.
 *
 * A planet draws the kinds of the rarity row set it draws its rarity from (`legacy` on P1 and P2,
 * `mixed` from P3; Systems' table order, not seed dependent). Only a planet entered under ore rules
 * 2 or later has a roster: a planet a save holds without them, or under rules 1, keeps the cells it
 * was generated with (HS condition c). The mixed table joined under ore rules 4 (#453), so a P3+
 * planet a save holds under rules 2 or 3 keeps its kindless cells, and it holds only on a planet
 * with a species pool: its slots fix a family the acts from P8 no longer paint (Systems on #453),
 * so P8+ draws no kind until its own rows land. Look only: horizontal, no price, gate or income
 * reads it.
 *
 * The slots are shared, but each planet picks the species pool they resolve to (ticket 542, TD
 * shape on #453, 6236465674): `kinds.pools` maps the planet index to a pool, never the seed, so a
 * pool changes which species a slot shows and never a stored cell.
 */
import { ORE_ROWS, rarityRowSetOfPlanet, type KindSlot, type RarityRowSet } from '../../ores'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { NO_KIND_SLOT } from '../../../systems/world/worldCell'

/** The ore rules version that brought the roster (ticket 446): 1 was the rarity rows alone. */
export const ROSTER_ORE_RULES = 2

/** The ore rules version that brought the mixed table's kinds (#453). */
export const MIXED_ROSTER_ORE_RULES = 4

const NO_KINDS: readonly KindSlot[] = Object.freeze([])

/** The kinds a planet's patches draw from, in roster order; empty before the roster's rules. */
export function planetRosterOf(params: PlanetParams): readonly KindSlot[] {
  const set = rarityRowSetOfPlanet(params)
  if (!hasRosterOfSet(params, set)) return NO_KINDS
  return ORE_ROWS.kinds.slotsBySet[set]
}

/** The kind a cell wears on its planet, from the slot it stores; null for none. */
export function rosterKindOf(params: PlanetParams, kindSlot: number): KindSlot | null {
  if (kindSlot === NO_KIND_SLOT) return null
  return planetRosterOf(params)[kindSlot - 1] ?? null
}

/**
 * The species pool the planet's kind slots resolve to, from its index alone. Null past the pools
 * table (P8+, #453): there a slot binds no species instead of borrowing another planet's pool.
 */
export function poolOfPlanet(params: PlanetParams): string | null {
  return ORE_ROWS.kinds.poolByPlanet.get(params.planetIndex) ?? null
}

function hasRosterOfSet(params: PlanetParams, set: RarityRowSet): boolean {
  const rules = set === 'mixed' ? MIXED_ROSTER_ORE_RULES : ROSTER_ORE_RULES
  return (params.oreRulesVersion ?? 0) >= rules && poolOfPlanet(params) !== null
}
