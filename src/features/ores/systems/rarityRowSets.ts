/**
 * Which rarity row set a stamped planet from P3 draws, and which kind table each set draws its
 * kinds from (ticket 445's sets; ticket 738's deep window).
 *
 * - `legacy`: P1, P2 and every planet a save holds without the ore rules; the legacy kind table.
 * - `mixed`: P3 on under ore rules 1 to 10, Systems' solved weights; the mixed kind table.
 * - `deep`: P3 on from ore rules 11, Bjor's deep-rares rule (GD lock on #737, 22 Oct): the mixed
 *   table's kinds and uncommon weights, with rare, epic and mythic drawn only from band 3
 *   (`d >= 0.35`), at 0.25, 0.5 and 1 times their band-5 weight in bands 3, 4 and 5 (mythic, live
 *   from band 4, at 0.5 and 1). Each tier's band-5 weight keeps the tier's value over a planet's
 *   ore what it was on the mixed rows, so its money moves out of band 2 into bands 3 to 5 and is
 *   not added (Systems' guard on ticket 738): solved on seed 83921's P3, P5 and P7 ore census
 *   (ore units per band times `V(t_b)`), rare 222-225, epic 70 and mythic 17 bp on all three.
 *   Frequency is the fix if a money check misses, never prices.
 *
 * A planet keeps the set of the rules it was entered with, so a planet a save holds never seams.
 */
import { DEEP_RARE_WINDOW_ORE_RULES } from '../../../systems/world/planetParams'
import type { RarityRowSet } from './rarityRows'

/** A table of kind slots: a planet draws the kinds of the table its row set names. */
export type KindTable = 'legacy' | 'mixed'

export const KIND_TABLES: readonly KindTable[] = ['legacy', 'mixed']

interface RowSetSpan {
  set: RarityRowSet
  table: KindTable
  fromOreRules: number
  beforeOreRules: number
}

/** Every row set with the kind table it draws and the ore rules it serves, `[from, before)`. */
const ROW_SET_SPANS: readonly RowSetSpan[] = [
  { set: 'legacy', table: 'legacy', fromOreRules: 0, beforeOreRules: Infinity },
  { set: 'mixed', table: 'mixed', fromOreRules: 0, beforeOreRules: DEEP_RARE_WINDOW_ORE_RULES },
  {
    set: 'deep',
    table: 'mixed',
    fromOreRules: DEEP_RARE_WINDOW_ORE_RULES,
    beforeOreRules: Infinity,
  },
]

/** The kind table a row set draws its kinds from: the deep rows draw the mixed table's. */
export function kindTableOf(set: RarityRowSet): KindTable {
  return spanOfSet(set).table
}

/** The set a planet from P3 entered under ore rules `oreRulesVersion` draws. */
export function mixedTableSetUnder(oreRulesVersion: number): RarityRowSet {
  const span = ROW_SET_SPANS.find(
    (row) => row.table === 'mixed' && isOverlapping(row, oreRulesVersion, oreRulesVersion + 1),
  )
  return (span as RowSetSpan).set
}

/** The row sets that draw `table` under some ore rules from `fromOreRules` to before `beforeOreRules`. */
export function rowSetsDrawingTableUnder(
  table: KindTable,
  fromOreRules: number,
  beforeOreRules: number,
): RarityRowSet[] {
  return ROW_SET_SPANS.filter(
    (row) => row.table === table && isOverlapping(row, fromOreRules, beforeOreRules),
  ).map((row) => row.set)
}

function spanOfSet(set: RarityRowSet): RowSetSpan {
  return ROW_SET_SPANS.find((row) => row.set === set) as RowSetSpan
}

/** Whether the set serves some ore rules from `fromOreRules` to before `beforeOreRules`. */
function isOverlapping(row: RowSetSpan, fromOreRules: number, beforeOreRules: number): boolean {
  return row.fromOreRules < beforeOreRules && fromOreRules < row.beforeOreRules
}
