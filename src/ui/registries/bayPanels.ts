/**
 * Slice panels on the bay screen (ticket 220, TD lock on #176), registered and sealed like
 * `hudPanels`. A panel reads its own slice store and takes no props.
 *
 * - `header`: drawn in the bay header just left of the money counter (the sell burst's
 *   `Lining −X` tag).
 * - `above`: a full-canvas, click-through layer over the bay screen, for presentation that must
 *   cross it (the burst's coins flying to the counter). It draws whether a bay is open or not, so
 *   a flight in progress finishes after undocking.
 *
 * An empty slot draws no markup.
 *
 * The Sell bay's body takes slice panels too (ticket 845, the TD ruling on #821 Q3): a row is data,
 * `{panelId, bayId, order, kind, visibleWhen}`, drawn after the bay's own rows by the view its
 * `kind` registered, which reads its own slice store by the row's panel id. The kernel holds no
 * merchant code, so a merchant is one row, and the list has no cap (`systems/views/bayPanelPages`).
 * With no row the bay draws exactly as before.
 */
import type { ComponentType } from 'react'
import type { AuthorityState } from '../../systems/authority/authorityState'
import {
  defineRegistry,
  entriesOf,
  type RegistryEntry,
  type SealedRegistration,
} from '../../systems/registries/seal'
import { bayPanelsInOrder } from '../../systems/views/bayPanelPages'
import type { BayId } from '../../systems/world/dockBays'

export type BayPanelSlot = 'header' | 'above'

export interface BayPanel {
  id: string
  slot: BayPanelSlot
  Panel: ComponentType
}

export const BAY_PANEL_REGISTRY = defineRegistry<BayPanel>('bayPanels')

/** The slot's panels, sorted by id. */
export function bayPanelsOf(slot: BayPanelSlot): readonly BayPanel[] {
  return entriesOf(BAY_PANEL_REGISTRY).filter((panel) => panel.slot === slot)
}

/** A body panel on a bay: data, drawn by the view its `kind` registered. */
export interface BayPanelRow {
  /** `<slice>.<name>`; the kind's view reads its own store by it. */
  panelId: string
  bayId: BayId
  /** Rows draw by order, then by panel id. */
  order: number
  /** A registered `BayPanelKind` id. */
  kind: string
  /** Whether the row draws now for the local player, read from the authority replica. */
  visibleWhen(state: AuthorityState, playerId: string): boolean
}

/** The view that draws every row of one kind; it takes the row's panel id and nothing else. */
export interface BayPanelKind {
  /** `<slice>.<name>`, named by rows' `kind`. */
  id: string
  Panel: ComponentType<{ panelId: string }>
}

/** The bays whose body draws panel rows; a row for another bay is refused at the seal. */
export const BAYS_WITH_PANEL_ROWS: readonly BayId[] = ['sell']

interface BayPanelRowEntry extends RegistryEntry {
  row: BayPanelRow
}

export const BAY_PANEL_ROW_REGISTRY = defineRegistry<BayPanelRowEntry>(
  'bayPanelRows',
  bayPanelRowSealProblem,
)

export const BAY_PANEL_KIND_REGISTRY = defineRegistry<BayPanelKind>('bayPanelKinds')

/** The registry entry for `row`, keyed by its panel id. */
export function bayPanelRowEntryOf(row: BayPanelRow): BayPanelRowEntry {
  return { id: row.panelId, row }
}

/** Every registered row, in panel id order. */
export function bayPanelRows(): readonly BayPanelRow[] {
  return entriesOf(BAY_PANEL_ROW_REGISTRY).map((entry) => entry.row)
}

/** The panel ids `bay` draws for `playerId` on `state`, in drawing order. */
export function shownBayPanelIdsOn(
  state: AuthorityState,
  playerId: string,
  bay: BayId,
): readonly string[] {
  const shown = bayPanelRows().filter((row) => isRowShownAt(row, bay, state, playerId))
  return bayPanelsInOrder(shown).map((row) => row.panelId)
}

/** The registered row `panelId`, or null. */
export function bayPanelRowById(panelId: string): BayPanelRow | null {
  return entriesOf(BAY_PANEL_ROW_REGISTRY).find((entry) => entry.id === panelId)?.row ?? null
}

/** The view of kind `kind`; a row naming a kind no slice registered is a slice bug. */
export function bayPanelKindOf(kind: string): BayPanelKind {
  const found = entriesOf(BAY_PANEL_KIND_REGISTRY).find((entry) => entry.id === kind)
  if (found === undefined) throw new Error(`no bay panel kind "${kind}" is registered`)
  return found
}

/** Rows naming a kind no slice registered: empty once every slice is loaded (a coverage spec). */
export function bayPanelRowsWithoutKind(): readonly BayPanelRow[] {
  const kinds = new Set(entriesOf(BAY_PANEL_KIND_REGISTRY).map((kind) => kind.id))
  return bayPanelRows().filter((row) => !kinds.has(row.kind))
}

function bayPanelRowSealProblem(
  registrations: readonly SealedRegistration<BayPanelRowEntry>[],
): string | null {
  const problems = registrations
    .map(({ entry }) => entry.row)
    .filter((row) => !BAYS_WITH_PANEL_ROWS.includes(row.bayId))
    .map((row) => `bay panel row "${row.panelId}" is on the ${row.bayId} bay, which draws none`)
  return problems.length === 0 ? null : problems.join('; ')
}

function isRowShownAt(
  row: BayPanelRow,
  bay: BayId,
  state: AuthorityState,
  playerId: string,
): boolean {
  return row.bayId === bay && row.visibleWhen(state, playerId)
}
