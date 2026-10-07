/**
 * The family rows #141 exposes (`{id, name, homeActs, gateClass}`): the name is the `ores`
 * catalogue's, the gate class this slice's (#141 is its single source, #142 reads it), and the home
 * acts are the acts that show the family as a common, rare or signature. Silhouette, hue and luma
 * live in #151's rows with `ore-visuals`.
 */
import { oreFamilies } from '../../ores'
import { familiesOfAct } from './planetActs'
import { THEME_ROWS, type ThemeRows } from './themeRows'

export interface FamilyRow {
  id: string
  name: string
  homeActs: readonly string[]
  gateClass: string
}

/** Every catalogue family with its home acts and gate class, in cell-code order. */
export function familyRows(rows: ThemeRows = THEME_ROWS): FamilyRow[] {
  return oreFamilies().map(({ id, name }) => ({
    id,
    name,
    homeActs: rows.acts.filter((act) => familiesOfAct(act).includes(id)).map((act) => act.id),
    gateClass: rows.gateClassByFamily[id],
  }))
}
