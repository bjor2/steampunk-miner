/**
 * The material kind slots of `ores.economy.json` (TD ruling on ticket 446, 6226236698 section 1 and
 * addendum 6226264758; Systems' `kinds.legacy` table, 6226253715 with the slot ids of 6226282340),
 * read once and refused whole when broken. A slot is the economy side of a material kind: which
 * family it sits under, which rarity tier it wears and which bands it is live in. It names no
 * species: a `materials.json` row binds to a slot by its `(pool, slot)` key (ticket 447).
 *
 * - `rosterMaxKinds`: the most kinds a planet's roster holds, every live kind counted (Horizontal
 *   Scaler). Raising it is a new `ORE_RULES_VERSION` that changes data only, never existing cells.
 * - One table per rarity row set: a planet draws the kinds of the set it draws its rarity from
 *   (`legacy` on P1 and P2, `mixed` from P3). A slot id is `<set>.<name>`, stable, never renumbered.
 *
 * A slot is live only where its tier has weight in its set, so a kind never sits on a band its
 * rarity never paints. Look only: no slot field reaches a price, a hardness or a gate.
 */
import { BAND_COUNT } from '../../../systems/world/planetGeometry'
import { MAX_KIND_SLOT } from '../../../systems/world/worldCell'
import { RARITY_ROW_SETS, type RarityRowSet } from './rarityRows'

export interface KindSlot {
  /** `<set>.<name>`, such as `legacy.c1`: the binding key a species row names. */
  slotId: string
  /** The ore family id the kind sits under; it is only ever drawn on cells of this family. */
  family: string
  /** The rarity tier id: the kind is drawn on patches of that tier's lead. */
  rarity: string
  /** The first and last band the kind is live in. */
  window: readonly [number, number]
}

export interface KindRows {
  rosterMaxKinds: number
  /** Per rarity row set, the slots in table order: a planet's roster keeps this order. */
  slotsBySet: Readonly<Record<RarityRowSet, readonly KindSlot[]>>
}

/** What the guards check a slot against: the families and the set's tier weights per band. */
export interface KindRowContext {
  familyIds: readonly string[]
  /** Per set, per tier id, bands 1 to 5 in basis points; common is never 0. */
  weightBpOf(set: RarityRowSet, rarity: string, band: number): number | undefined
}

/** The roster index plus one fills the 8-bit kind slot, so 255 kinds at most. */
const MOST_KINDS = MAX_KIND_SLOT
const SLOT_NAME = /^[a-z][a-z0-9]*$/

type Raw = Record<string, unknown>

/** Why the `kinds` block is not a set of slot tables; empty when it is. */
export function kindRowProblems(kinds: unknown, context: KindRowContext): string[] {
  const raw = (kinds ?? {}) as Raw
  const cap = raw.rosterMaxKinds
  const isCap = Number.isSafeInteger(cap) && (cap as number) >= 1 && (cap as number) <= MOST_KINDS
  return [
    ...(isCap ? [] : [`ore.kinds.rosterMaxKinds must be a whole number from 1 to ${MOST_KINDS}`]),
    ...RARITY_ROW_SETS.flatMap((set) => slotTableProblems(raw[set], set, cap, context)),
    ...unknownTableProblems(raw),
  ]
}

/** The block as typed rows; call only on a block `kindRowProblems` accepts. */
export function kindRowsOf(kinds: Raw): KindRows {
  const tableOf = (set: RarityRowSet) => (kinds[set] as Raw[]).map(kindSlotOf)
  return {
    rosterMaxKinds: kinds.rosterMaxKinds as number,
    slotsBySet: { legacy: tableOf('legacy'), mixed: tableOf('mixed') },
  }
}

/** Whether band `band` is in the slot's window. */
export function isSlotLiveInBand(slot: KindSlot, band: number): boolean {
  return band >= slot.window[0] && band <= slot.window[1]
}

function kindSlotOf(row: Raw): KindSlot {
  const [first, last] = row.window as number[]
  return {
    slotId: row.slotId as string,
    family: row.family as string,
    rarity: row.rarity as string,
    window: [first, last],
  }
}

function slotTableProblems(
  table: unknown,
  set: RarityRowSet,
  cap: unknown,
  context: KindRowContext,
): string[] {
  if (!Array.isArray(table)) return [`ore.kinds.${set} must be a list of kind slots`]
  const rows = table as Raw[]
  const ids = rows.map((row) => String(row.slotId))
  const isOverCap = typeof cap === 'number' && rows.length > cap
  return [
    ...(isOverCap ? [`ore.kinds.${set} holds ${rows.length} kinds, over rosterMaxKinds`] : []),
    ...rows.flatMap((row, at) => slotRowProblems(row, `ore.kinds.${set}[${at}]`, set, context)),
    ...repeatedIdsOf(ids).map((id) => `kind slot "${id}" twice`),
  ]
}

function slotRowProblems(
  row: Raw,
  where: string,
  set: RarityRowSet,
  context: KindRowContext,
): string[] {
  const isFamily = context.familyIds.includes(String(row.family))
  const shapeProblems = [
    ...(isSlotIdOf(row.slotId, set) ? [] : [`${where}.slotId must be "${set}.<name>"`]),
    ...(isFamily ? [] : [`${where}.family must name an ore family`]),
    ...(isBandWindow(row.window) ? [] : [`${where}.window must be [first, last] in 1..5`]),
  ]
  if (shapeProblems.length > 0) return shapeProblems
  return deadBandProblems(row, where, set, context)
}

/** A kind is never live where its tier weighs nothing in the set (Systems, #139 section 5). */
function deadBandProblems(row: Raw, where: string, set: RarityRowSet, context: KindRowContext) {
  const [first, last] = row.window as number[]
  const rarity = String(row.rarity)
  const bands = Array.from({ length: last - first + 1 }, (_, at) => first + at)
  const weights = bands.map((band) => context.weightBpOf(set, rarity, band))
  if (weights.some((weight) => weight === undefined)) {
    return [`${where}.rarity must name a rarity tier`]
  }
  return bands
    .filter((_, at) => weights[at] === 0)
    .map((band) => `${where} is live in band ${band}, where ${set} ${rarity} weighs nothing`)
}

function repeatedIdsOf(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))]
}

function unknownTableProblems(raw: Raw): string[] {
  const known = ['rosterMaxKinds', ...RARITY_ROW_SETS]
  return Object.keys(raw)
    .filter((key) => !known.includes(key))
    .map((key) => `ore.kinds.${key} is not a rarity row set`)
}

function isSlotIdOf(slotId: unknown, set: RarityRowSet): boolean {
  if (typeof slotId !== 'string' || !slotId.startsWith(`${set}.`)) return false
  return SLOT_NAME.test(slotId.slice(set.length + 1))
}

function isBandWindow(window: unknown): boolean {
  if (!Array.isArray(window) || window.length !== 2) return false
  const [first, last] = window as unknown[]
  return isBand(first) && isBand(last) && (first as number) <= (last as number)
}

function isBand(band: unknown): boolean {
  return Number.isSafeInteger(band) && (band as number) >= 1 && (band as number) <= BAND_COUNT
}
