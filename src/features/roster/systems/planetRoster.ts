/**
 * A planet's material roster (TD ruling on ticket 446, 6226236698 section 2): the ordered kind
 * slots its patches draw from, a pure function of the planet's params. A cell stores its roster
 * index plus one (`kindSlotOfCell`), and a species is found from the slot's descriptor, never from
 * the stored number, so adding rows never renumbers a cell.
 *
 * A planet draws the kinds of the table its rarity row set names (`legacy` on P1 and P2, `mixed`
 * from P3 under the mixed and the deep rows alike, ticket 738; Systems' table order, not seed
 * dependent). Only a planet entered under ore rules 2 or later has a roster: a planet a save holds
 * without them, or under rules 1, keeps the cells it was generated with (HS condition c). The mixed table joined under ore rules 4 (#453), so a P3+
 * planet a save holds under rules 2 or 3 keeps its kindless cells, and it holds only on a planet
 * with a species pool: its slots fix a family the acts from P8 no longer paint (Systems on #453),
 * so P8+ draws no kind until its own rows land. Look only: horizontal, no price, gate or income
 * reads it.
 *
 * The slots are shared, but each planet picks the species pool they resolve to (ticket 542, TD
 * shape on #453, 6236465674): the planet's registry row (`ores` `planets.rows`) names its pool by
 * planet index, never the seed, so a pool changes which species a slot shows and never a stored
 * cell. A pool may also own slots of its table from an ore rules version on (ticket 709): P2 entered
 * under rules 9 draws its three own kinds after the 12 shared legacy slots, while P1 and a P2 a save
 * holds under older rules keep the 12.
 */
import {
  kindTableOf,
  ORE_ROWS,
  poolOfPlanetUnder,
  rarityRowSetOfPlanet,
  slotsOfPoolUnder,
  type KindSlot,
  type RarityRowSet,
} from '../../ores'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { NO_KIND_SLOT } from '../../../systems/world/worldCell'

/** The ore rules version that brought the roster (ticket 446): 1 was the rarity rows alone. */
export const ROSTER_ORE_RULES = 2

/** The ore rules version that brought the mixed table's kinds (#453). */
export const MIXED_ROSTER_ORE_RULES = 4

const NO_KINDS: readonly KindSlot[] = Object.freeze([])

/** One roster per set, pool and ore rules, so the per-patch fold allocates none. */
const rosterByKey = new Map<string, readonly KindSlot[]>()

/** The kinds a planet's patches draw from, in roster order; empty before the roster's rules. */
export function planetRosterOf(params: PlanetParams): readonly KindSlot[] {
  const set = rarityRowSetOfPlanet(params)
  if (!hasRosterOfSet(params, set)) return NO_KINDS
  return rosterOfPool(set, poolOfPlanet(params) as string, params.oreRulesVersion)
}

/** The kind a cell wears on its planet, from the slot it stores; null for none. */
export function rosterKindOf(params: PlanetParams, kindSlot: number): KindSlot | null {
  if (kindSlot === NO_KIND_SLOT) return null
  return planetRosterOf(params)[kindSlot - 1] ?? null
}

/**
 * The species pool the planet's kind slots resolve to, from its index and ore rules stamp, never
 * the seed: a planet a save holds under rules older than its pool's keeps the pool it was entered
 * with (ticket 632). Null past the pools table (P8+, #453): there a slot binds no species instead
 * of borrowing another planet's pool.
 */
export function poolOfPlanet(params: PlanetParams): string | null {
  return poolOfPlanetUnder(ORE_ROWS.kinds, params.planetIndex, params.oreRulesVersion)
}

function rosterOfPool(
  set: RarityRowSet,
  pool: string,
  oreRulesVersion: number | undefined,
): readonly KindSlot[] {
  const key = `${set}|${pool}|${oreRulesVersion ?? 0}`
  const known = rosterByKey.get(key)
  if (known !== undefined) return known
  const roster = Object.freeze(slotsOfPoolUnder(ORE_ROWS.kinds, set, pool, oreRulesVersion))
  rosterByKey.set(key, roster)
  return roster
}

function hasRosterOfSet(params: PlanetParams, set: RarityRowSet): boolean {
  const rules = kindTableOf(set) === 'mixed' ? MIXED_ROSTER_ORE_RULES : ROSTER_ORE_RULES
  return (params.oreRulesVersion ?? 0) >= rules && poolOfPlanet(params) !== null
}
