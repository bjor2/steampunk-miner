/**
 * The Upgrade bay's bay entries (ticket 344, TD lock on #314 section 1): each registered source
 * whose anchor row ships is asked for its entries, on every planet (Bjor's price-only ruling on
 * #411: the row's planet only prices what it sells), and a vision row's never (the `bayScreens`
 * rule: it never opens, so it never shows). Entries sort by the anchor's
 * index in the locked schedule, then by entry id. An entry whose card names a vehicle item no
 * slice registered is a held item (siphon, probe, sounder, magnets) and is never previewed.
 *
 * A track at its wall keeps its row with no buy: it reads Mastered with the maxed badge.
 */
import type { AuthorityState } from '../authority/authorityState'
import { isFeatureForSale } from '../authority/featureSales'
import {
  BAY_ENTRY_REGISTRY,
  refuseUnlockIdEntries,
  type BayEntry,
  type BayEntrySource,
} from '../registries/bayEntries'
import { entriesOf } from '../registries/seal'
import { isVehicleItemId } from '../registries/vehicleLoadout'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'
import type { ScreenButton } from './viewParts'
import { buyStateOf, isBuyOpen, type BuyState, type RowBadge } from './workshopRows'

export interface BayEntryRow extends BayEntry {
  /** Null on a Mastered entry, which has no buy. */
  buyState: BuyState | null
  /** The star once the entry is Mastered (#158 state badges). */
  badge: RowBadge
  isBuyOpen: boolean
  isMastered: boolean
}

interface AnchoredEntry {
  anchorIndex: number
  entry: BayEntry
}

export function bayEntryRowsOf(state: AuthorityState, playerId: string): BayEntryRow[] {
  const anchored = openSourcesOf(state).flatMap((source) =>
    anchoredEntriesOf(state, playerId, source),
  )
  return sortedByAnchorThenId(anchored.filter(isPreviewable)).map(({ entry }) => rowOf(entry))
}

/** The buys of the rows still for sale, in row order: Mastered rows are no focus stop. */
export function bayEntryButtonsOf(rows: readonly BayEntryRow[]): ScreenButton[] {
  return rows.flatMap((row) => (row.buy === null ? [] : [row.buy]))
}

function openSourcesOf(state: AuthorityState): BayEntrySource[] {
  return entriesOf(BAY_ENTRY_REGISTRY).filter(
    (source) => source.bay === 'upgrade' && isFeatureForSale(state, source.anchorFeatureId),
  )
}

function anchoredEntriesOf(
  state: AuthorityState,
  playerId: string,
  source: BayEntrySource,
): AnchoredEntry[] {
  const anchorIndex = scheduleIndexOf(source.anchorFeatureId)
  const entries = refuseUnlockIdEntries(source, source.entriesOf(state, playerId))
  return entries.map((entry) => ({ anchorIndex, entry }))
}

function scheduleIndexOf(featureId: string): number {
  return LOCKED_SCHEDULE.rows.findIndex((row) => row.id === featureId)
}

/** A card naming an unregistered vehicle item previews a held item. */
function isPreviewable({ entry }: AnchoredEntry): boolean {
  const item = entry.card.item
  return item.kind !== 'vehicle-item' || isVehicleItemId(item.id)
}

function sortedByAnchorThenId(anchored: AnchoredEntry[]): AnchoredEntry[] {
  return [...anchored].sort(
    (a, b) => a.anchorIndex - b.anchorIndex || compareCodeUnits(a.entry.entryId, b.entry.entryId),
  )
}

/** Code-unit order, never locale order, so every machine lists the same way. */
function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function rowOf(entry: BayEntry): BayEntryRow {
  const buy = entry.buy
  return {
    ...entry,
    buyState: buy === null ? null : buyStateOf(buy),
    badge: buy === null ? 'maxed' : null,
    isBuyOpen: buy !== null && isBuyOpen(buy),
    isMastered: buy === null,
  }
}
