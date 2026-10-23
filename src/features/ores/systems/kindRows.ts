/**
 * The material kind slots of `ores.economy.json` (TD ruling on ticket 446, 6226236698 section 1 and
 * addendum 6226264758; Systems' `kinds.legacy` table, 6226253715 with the slot ids of 6226282340),
 * read once and refused whole when broken. A slot is the economy side of a material kind: which
 * family it sits under, which rarity tier it wears and which bands it is live in. It names no
 * species: a `materials.json` row binds to a slot by its `(pool, slot)` key (ticket 447).
 *
 * - `rosterMaxKinds`: the most kinds a planet's roster holds, every live kind counted (Horizontal
 *   Scaler). Raising it is a new `ORE_RULES_VERSION` that changes data only, never existing cells.
 * - Two kind tables, `legacy` and `mixed`: a planet draws the kinds of the table its rarity row set
 *   names (`legacy` on P1 and P2, `mixed` from P3, under the `mixed` and the `deep` rows alike,
 *   `rarityRowSets.ts`). A slot id is `<table>.<name>`, stable, never renumbered.
 * - The species pool each planet's slots resolve to (TD shape on ticket 542, #453 comment
 *   6236465674) sits on the planet's row of the planet registry (`planetRows.ts`, ticket 642), so
 *   P3, P4 and P5 show their own species on shared slots; a planet with no pool binds no species.
 * - `poolsBeforeOreRules`: an ore rules version to the pools planets had before it (ticket 632, GD
 *   lock (b) on #595), so a planet a save holds under earlier rules keeps the species it was
 *   entered with: P2 entered before rules 6 stays on `legacy`. Optional; a planet it names must be
 *   one the registry gives a pool.
 * - A slot may belong to one pool from an ore rules version on (`pool` + `fromOreRules`, ticket 709,
 *   GD ruling (A) on #709): only a planet resolving to that pool and entered under those rules or
 *   later draws it, so P2's own kinds never reach P1 or a P2 a save holds under older rules. Own
 *   slots follow every shared slot of their table, so leaving them out never moves the roster index
 *   a stored cell names.
 * - A slot's window may narrow at an ore rules version (`windowsBeforeOreRules`, ticket 738,
 *   `slotWindows.ts`): a planet stamped before it keeps the window it was entered with.
 *
 * A slot is live only where its tier has weight in every set that draws its window, so a kind never
 * sits on a band its rarity never paints. Look only: no slot field reaches a price, a hardness or a
 * gate.
 */
import { ORE_RULES_VERSION } from '../../../systems/world/planetParams'
import { MAX_KIND_SLOT } from '../../../systems/world/worldCell'
import { isPlainMap, isPoolId } from './planetRows'
import { KIND_TABLES, kindTableOf, rowSetsDrawingTableUnder, type KindTable } from './rarityRowSets'
import type { RarityRowSet } from './rarityRows'
import {
  earlierWindowsOf,
  earlierWindowTableProblems,
  isBandWindow,
  windowSpansOf,
  type BandWindow,
  type EarlierWindow,
} from './slotWindows'

export interface KindSlot {
  /** `<table>.<name>`, such as `legacy.c1`: the binding key a species row names. */
  slotId: string
  /** The ore family id the kind sits under; it is only ever drawn on cells of this family. */
  family: string
  /** The rarity tier id: the kind is drawn on patches of that tier's lead. */
  rarity: string
  /** The first and last band the kind is live in under the newest ore rules. */
  window: BandWindow
  /** The windows planets stamped before an ore rules version keep (ticket 738); earliest first. */
  earlierWindows?: readonly EarlierWindow[]
  /** Set on a pool's own slot (ticket 709): the one pool that draws it, and from which rules. */
  owner?: SlotOwner
}

/** The pool a slot belongs to and the ore rules it joined that pool's rosters under (ticket 709). */
export interface SlotOwner {
  pool: string
  fromOreRules: number
}

/** The pool a planet resolved to before an ore rules version moved it (ticket 632). */
export interface EarlierPool {
  /** The ore rules that moved the planet off this pool. */
  beforeOreRules: number
  planetIndex: number
  pool: string
}

export interface KindRows {
  rosterMaxKinds: number
  /** Per kind table, the slots in table order: a planet's roster keeps this order. */
  slotsByTable: Readonly<Record<KindTable, readonly KindSlot[]>>
  /** Planet index to species pool id under the newest ore rules; a planet missing here binds none. */
  poolByPlanet: ReadonlyMap<number, string>
  /** Earliest rules first, so the first row a planet's stamp predates is the pool it entered with. */
  earlierPools: readonly EarlierPool[]
}

/** What the guards check a slot against: the families and each set's tier weights per band. */
export interface KindRowContext {
  familyIds: readonly string[]
  /** The planets the registry gives a pool, as `poolsBeforeOreRules` keys name them. */
  pooledPlanets: readonly string[]
  /** The pool ids the registry's planet rows name, which a pool's own slot may name. */
  poolIds: readonly string[]
  /** The rarity tier ids, common first. */
  tierIds: readonly string[]
  /** Per set, per tier id, bands 1 to 5 in basis points; common is never 0. */
  weightBpOf(set: RarityRowSet, rarity: string, band: number): number | undefined
}

/** The roster index plus one fills the 8-bit kind slot, so 255 kinds at most. */
const MOST_KINDS = MAX_KIND_SLOT
const SLOT_NAME = /^[a-z][a-z0-9]*$/
const WHOLE_KEY = /^[1-9][0-9]*$/

type Raw = Record<string, unknown>

/** Why the `kinds` block is not a set of slot tables; empty when it is. */
export function kindRowProblems(kinds: unknown, context: KindRowContext): string[] {
  const raw = (kinds ?? {}) as Raw
  const cap = raw.rosterMaxKinds
  const isCap = Number.isSafeInteger(cap) && (cap as number) >= 1 && (cap as number) <= MOST_KINDS
  return [
    ...(isCap ? [] : [`ore.kinds.rosterMaxKinds must be a whole number from 1 to ${MOST_KINDS}`]),
    ...KIND_TABLES.flatMap((table) => slotTableProblems(raw[table], table, cap, context)),
    ...earlierPoolTableProblems(raw.poolsBeforeOreRules, context.pooledPlanets),
    ...unknownTableProblems(raw),
  ]
}

/**
 * The block as typed rows, with the registry's pools; call only on a block `kindRowProblems`
 * accepts.
 */
export function kindRowsOf(kinds: Raw, poolByPlanet: ReadonlyMap<number, string>): KindRows {
  const tableOf = (table: KindTable) => (kinds[table] as Raw[]).map(kindSlotOf)
  return {
    rosterMaxKinds: kinds.rosterMaxKinds as number,
    slotsByTable: { legacy: tableOf('legacy'), mixed: tableOf('mixed') },
    poolByPlanet,
    earlierPools: earlierPoolsOf((kinds.poolsBeforeOreRules ?? {}) as EarlierPoolTable),
  }
}

/**
 * The pool planet `planetIndex` resolves to under ore rules `oreRulesVersion`: the pool of the
 * earliest rules its stamp predates, else today's; null past the pools table.
 */
export function poolOfPlanetUnder(
  kinds: KindRows,
  planetIndex: number,
  oreRulesVersion: number | undefined,
): string | null {
  const earlier = earlierPoolOf(kinds, planetIndex, oreRulesVersion ?? 0)
  return earlier?.pool ?? kinds.poolByPlanet.get(planetIndex) ?? null
}

/**
 * The slots of the kind table of `set` a planet resolving to `pool` under ore rules
 * `oreRulesVersion` draws, in table order: every shared slot, then the pool's own slots its rules
 * reach.
 */
export function slotsOfPoolUnder(
  kinds: KindRows,
  set: RarityRowSet,
  pool: string,
  oreRulesVersion: number | undefined,
): KindSlot[] {
  return kinds.slotsByTable[kindTableOf(set)].filter((slot) =>
    isSlotDrawnBy(slot, pool, oreRulesVersion ?? 0),
  )
}

function isSlotDrawnBy(slot: KindSlot, pool: string, oreRulesVersion: number): boolean {
  if (slot.owner === undefined) return true
  return slot.owner.pool === pool && oreRulesVersion >= slot.owner.fromOreRules
}

type EarlierPoolTable = Record<string, Record<string, string>>

function earlierPoolsOf(table: EarlierPoolTable): EarlierPool[] {
  return Object.entries(table)
    .flatMap(([rules, pools]) =>
      Object.entries(pools).map(([planet, pool]) => ({
        beforeOreRules: Number.parseInt(rules, 10),
        planetIndex: Number.parseInt(planet, 10),
        pool,
      })),
    )
    .sort((a, b) => a.beforeOreRules - b.beforeOreRules)
}

function earlierPoolOf(
  kinds: KindRows,
  planetIndex: number,
  oreRulesVersion: number,
): EarlierPool | undefined {
  return kinds.earlierPools.find(
    (row) => row.planetIndex === planetIndex && oreRulesVersion < row.beforeOreRules,
  )
}

function kindSlotOf(row: Raw): KindSlot {
  const [first, last] = row.window as number[]
  const earlierWindows = earlierWindowsOf(row.windowsBeforeOreRules)
  const slot: KindSlot = {
    slotId: row.slotId as string,
    family: row.family as string,
    rarity: row.rarity as string,
    window: [first, last],
    ...(earlierWindows === undefined ? {} : { earlierWindows }),
  }
  if (row.pool === undefined) return slot
  return { ...slot, owner: { pool: row.pool as string, fromOreRules: row.fromOreRules as number } }
}

function slotTableProblems(
  slots: unknown,
  table: KindTable,
  cap: unknown,
  context: KindRowContext,
): string[] {
  if (!Array.isArray(slots)) return [`ore.kinds.${table} must be a list of kind slots`]
  const rows = slots as Raw[]
  const ids = rows.map((row) => String(row.slotId))
  const isOverCap = typeof cap === 'number' && rows.length > cap
  return [
    ...(isOverCap ? [`ore.kinds.${table} holds ${rows.length} kinds, over rosterMaxKinds`] : []),
    ...rows.flatMap((row, at) => slotRowProblems(row, `ore.kinds.${table}[${at}]`, table, context)),
    ...repeatedIdsOf(ids).map((id) => `kind slot "${id}" twice`),
    ...sharedAfterOwnProblems(rows, table),
  ]
}

/** A shared slot after an own slot would sit at another roster index on the planets without it. */
function sharedAfterOwnProblems(rows: readonly Raw[], table: KindTable): string[] {
  const firstOwn = rows.findIndex(isOwnSlotRow)
  if (firstOwn < 0) return []
  return rows
    .map((row, at) => ({ row, at }))
    .filter(({ row, at }) => at > firstOwn && !isOwnSlotRow(row))
    .map(({ at }) => `ore.kinds.${table}[${at}] is shared but follows a pool's own slot`)
}

function isOwnSlotRow(row: Raw): boolean {
  return row.pool !== undefined || row.fromOreRules !== undefined
}

function slotRowProblems(
  row: Raw,
  where: string,
  table: KindTable,
  context: KindRowContext,
): string[] {
  const isFamily = context.familyIds.includes(String(row.family))
  const shapeProblems = [
    ...(isSlotIdOf(row.slotId, table) ? [] : [`${where}.slotId must be "${table}.<name>"`]),
    ...(isFamily ? [] : [`${where}.family must name an ore family`]),
    ...(isBandWindow(row.window) ? [] : [`${where}.window must be [first, last] in 1..5`]),
    ...earlierWindowTableProblems(row.windowsBeforeOreRules, where),
    ...ownerProblems(row, where, context.poolIds),
  ]
  if (shapeProblems.length > 0) return shapeProblems
  return deadBandProblems(row, where, table, context)
}

/** An own slot names a registry pool and an ore rules version this build knows, both or neither. */
function ownerProblems(row: Raw, where: string, poolIds: readonly string[]): string[] {
  if (!isOwnSlotRow(row)) return []
  return [
    ...(poolIds.includes(row.pool as string) ? [] : [`${where}.pool must name a registry pool`]),
    ...(isKnownOreRules(row.fromOreRules)
      ? []
      : [`${where}.fromOreRules must be an ore rules version from 2 to ${ORE_RULES_VERSION}`]),
  ]
}

/**
 * A kind is never live where its tier weighs nothing (Systems, #139 section 5): each window it holds
 * under some ore rules is checked against every row set drawing its table under those rules.
 */
function deadBandProblems(row: Raw, where: string, table: KindTable, context: KindRowContext) {
  const rarity = String(row.rarity)
  if (!context.tierIds.includes(rarity)) return [`${where}.rarity must name a rarity tier`]
  return windowSpansOf(kindSlotOf(row)).flatMap(({ window, fromOreRules, beforeOreRules }) =>
    rowSetsDrawingTableUnder(table, fromOreRules, beforeOreRules).flatMap((set) =>
      deadWindowProblems(window, rarity, where, set, context),
    ),
  )
}

function deadWindowProblems(
  [first, last]: BandWindow,
  rarity: string,
  where: string,
  set: RarityRowSet,
  context: KindRowContext,
): string[] {
  const bands = Array.from({ length: last - first + 1 }, (_, at) => first + at)
  return bands
    .filter((band) => context.weightBpOf(set, rarity, band) === 0)
    .map((band) => `${where} is live in band ${band}, where ${set} ${rarity} weighs nothing`)
}

function repeatedIdsOf(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))]
}

/** Versions this build knows past the first, each naming pooled planets and a pool id. */
function earlierPoolTableProblems(table: unknown, pooledPlanets: readonly string[]): string[] {
  if (table === undefined) return []
  if (!isPlainMap(table)) {
    return ['ore.kinds.poolsBeforeOreRules must map ore rules versions to planet pools']
  }
  return Object.entries(table).flatMap(([rules, planets]) =>
    earlierPoolRowProblems(rules, planets, pooledPlanets),
  )
}

function earlierPoolRowProblems(
  rules: string,
  planets: unknown,
  pooledPlanets: readonly string[],
): string[] {
  const where = `ore.kinds.poolsBeforeOreRules.${rules}`
  const version = WHOLE_KEY.test(rules) ? Number.parseInt(rules, 10) : 0
  const isVersion = version > 1 && version <= ORE_RULES_VERSION
  if (!isVersion) return [`${where} must be an ore rules version from 2 to ${ORE_RULES_VERSION}`]
  if (!isPlainMap(planets)) return [`${where} must map planet indices to pool ids`]
  return Object.entries(planets).flatMap(([planet, pool]) => [
    ...(pooledPlanets.includes(planet) ? [] : [`${where}.${planet} names a planet with no pool`]),
    ...(isPoolId(pool) ? [] : [`${where}.${planet} must be a kebab-case pool id`]),
  ])
}

function unknownTableProblems(raw: Raw): string[] {
  const known = ['rosterMaxKinds', 'poolsBeforeOreRules', ...KIND_TABLES]
  return Object.keys(raw)
    .filter((key) => !known.includes(key))
    .map((key) => `ore.kinds.${key} is not a kind table`)
}

function isKnownOreRules(rules: unknown): boolean {
  return (
    Number.isSafeInteger(rules) && (rules as number) > 1 && (rules as number) <= ORE_RULES_VERSION
  )
}

function isSlotIdOf(slotId: unknown, table: KindTable): boolean {
  if (typeof slotId !== 'string' || !slotId.startsWith(`${table}.`)) return false
  return SLOT_NAME.test(slotId.slice(table.length + 1))
}
