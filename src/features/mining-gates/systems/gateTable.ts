/**
 * Which cells of a planet's mix are gated, and by what (#142 "Which cells are gated"), a pure
 * function of the band's mix (`oreMixFor`), so generation, the drill, the bot and the report all
 * read one table. From the planet gate content starts on (GD lock on #148: P7):
 *
 * 1. Common cells (lead 0) are never gated beyond the ordinary drill rule.
 * 2. Lead cells take their family's `gateClass` (#141): `drill` is dense; a rig class is that
 *    rig's gate from its arrival planet, dense before; `dynamite` is a dynamite gate at #143's
 *    `minChargeFor`.
 * 3. The signature asks for the planet's signature rig, or is a drill-gated signature with none.
 * 4. Same-item rule: a +2 entry needing the item a +1 entry of its band needs falls back to dense.
 * 5. 15% guard: per item (each rig, dynamite, the drill-gated signature's tip), the band's ore
 *    value needing it is at most 15%, valued at each entry's sale tier. Over it, the lead entries
 *    needing it fall back to dense first, then the signature to a drill-gated signature.
 *
 * Before gate content, only signatures are gated: drill-gated, as #232 drills them. Vertical for
 * the drill gates, horizontal for the rig and dynamite gates, both for the guard.
 */
import { oreSalePrice, signatureSaleTier } from '../../../systems/economy/oreEconomy'
import {
  add,
  cmp,
  div,
  floor,
  fromSafeInteger,
  mul,
  toSafeInteger,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { minChargeFor } from '../../dynamite'
import { gateClassOf, type OreMix, type OreMixEntry } from '../../planet-mix'
import { GATE_ROWS, type GateRows, type Rig } from './gateRows'
import { isRigAvailableOn, rigOfGateClass, signatureRigOf } from './rigs'

export type CellGate =
  | { kind: 'none' }
  | { kind: 'dense' }
  | { kind: 'drillSignature' }
  | { kind: 'rig'; rig: Rig }
  | { kind: 'dynamite'; minCharge: number }

export type CellGateKind = CellGate['kind']

/** One entry of a band's mix with the gate its cells carry. */
export interface GatedEntry {
  entry: OreMixEntry
  gate: CellGate
}

export interface GateTable {
  planetIndex: number
  /** Bands 1 to 5. */
  bands: readonly (readonly GatedEntry[])[]
}

const NO_GATE: CellGate = { kind: 'none' }
const DENSE: CellGate = { kind: 'dense' }
const DRILL_SIGNATURE: CellGate = { kind: 'drillSignature' }
const DRILL_SIGNATURE_ITEM = 'drill-signature'
const BASIS_POINTS = 10000
const PLUS_ONE = 1
const PLUS_TWO = 2

/** #142's `gateTableOf`: every band of the mix with its gates resolved. */
export function gateTableOf(mix: OreMix, rows: GateRows = GATE_ROWS): GateTable {
  return {
    planetIndex: mix.planetIndex,
    bands: mix.bands.map((entries, at) => bandGatesOf(mix.planetIndex, at + 1, entries, rows)),
  }
}

/** One band: gates by rule, then the same-item rule, then the guard. */
export function bandGatesOf(
  planetIndex: number,
  band: number,
  entries: readonly OreMixEntry[],
  rows: GateRows = GATE_ROWS,
): GatedEntry[] {
  const gated = entries.map((entry) => ({
    entry,
    gate: gateByRuleOf(planetIndex, band, entry, rows),
  }))
  return guardedOf(withSameItemRule(gated), rows)
}

/** What a cell of this gate needs that an on-curve vehicle may lack, or null for none. */
export function itemOfGate(gate: CellGate): string | null {
  if (gate.kind === 'rig') return gate.rig.id
  if (gate.kind === 'dynamite') return 'dynamite'
  if (gate.kind === 'drillSignature') return DRILL_SIGNATURE_ITEM
  return null
}

/** Basis points of the band's ore value whose cells need `item`, rounded down. */
export function gatedValueShareBpOf(gated: readonly GatedEntry[], item: string): number {
  const needing = gated.filter(({ gate }) => itemOfGate(gate) === item)
  if (needing.length === 0) return 0
  return wholeBasisPointsOf(valueOf(needing), valueOf(gated))
}

function gateByRuleOf(
  planetIndex: number,
  band: number,
  entry: OreMixEntry,
  rows: GateRows,
): CellGate {
  if (planetIndex < rows.gateContentFromPlanet) return entry.signature ? DRILL_SIGNATURE : NO_GATE
  if (entry.signature) return signatureGateOf(planetIndex, rows)
  if (entry.lead === 0) return NO_GATE
  return leadGateOf(planetIndex, band, entry, rows)
}

function signatureGateOf(planetIndex: number, rows: GateRows): CellGate {
  const rig = signatureRigOf(planetIndex, rows)
  return rig === null ? DRILL_SIGNATURE : { kind: 'rig', rig }
}

function leadGateOf(
  planetIndex: number,
  band: number,
  entry: OreMixEntry,
  rows: GateRows,
): CellGate {
  const gateClass = gateClassOf(entry.family)
  if (gateClass === 'dynamite') {
    return { kind: 'dynamite', minCharge: minChargeFor({ lead: entry.lead, band }, planetIndex) }
  }
  const rig = rigOfGateClass(gateClass, rows)
  return rig !== null && isRigAvailableOn(rig, planetIndex, rows) ? { kind: 'rig', rig } : DENSE
}

/** A +2 entry needing what a +1 entry of the band needs falls back to dense (#142 rule 4). */
function withSameItemRule(gated: readonly GatedEntry[]): GatedEntry[] {
  const plusOneItems = itemsOf(gated.filter(({ entry }) => isLeadEntry(entry, PLUS_ONE)))
  return gated.map((one) =>
    isLeadEntry(one.entry, PLUS_TWO) && plusOneItems.includes(itemOfGate(one.gate))
      ? { ...one, gate: DENSE }
      : one,
  )
}

/** Lead entries first, then the signature, fall back while their item is over the guard. */
function guardedOf(gated: readonly GatedEntry[], rows: GateRows): GatedEntry[] {
  const leadsGuarded = gated.map((one) =>
    !one.entry.signature && isOverGuard(gated, one.gate, rows) ? { ...one, gate: DENSE } : one,
  )
  return leadsGuarded.map((one) =>
    one.entry.signature && isOverGuard(leadsGuarded, one.gate, rows)
      ? { ...one, gate: DRILL_SIGNATURE }
      : one,
  )
}

function isOverGuard(gated: readonly GatedEntry[], gate: CellGate, rows: GateRows): boolean {
  const item = itemOfGate(gate)
  if (item === null) return false
  const total = valueOf(gated)
  const needing = valueOf(gated.filter((one) => itemOfGate(one.gate) === item))
  const allowed = mul(total, fromSafeInteger(rows.maxGatedValueShareBp))
  return cmp(mul(needing, fromSafeInteger(BASIS_POINTS)), allowed) > 0
}

function itemsOf(gated: readonly GatedEntry[]): (string | null)[] {
  return gated.map(({ gate }) => itemOfGate(gate)).filter((item) => item !== null)
}

function isLeadEntry(entry: OreMixEntry, lead: number): boolean {
  return !entry.signature && entry.lead === lead
}

/** The band's expected ore value: each entry's weight at its sale tier (a signature's is +1). */
function valueOf(gated: readonly GatedEntry[]): Money {
  return gated.reduce((sum, { entry }) => add(sum, valueOfEntry(entry)), ZERO_MONEY)
}

function valueOfEntry(entry: OreMixEntry): Money {
  const saleTier = entry.signature ? signatureSaleTier(entry.tier) : entry.tier
  return mul(fromSafeInteger(entry.weightBp), oreSalePrice(saleTier))
}

function wholeBasisPointsOf(part: Money, whole: Money): number {
  return toSafeInteger(floor(div(mul(part, fromSafeInteger(BASIS_POINTS)), whole)))
}
