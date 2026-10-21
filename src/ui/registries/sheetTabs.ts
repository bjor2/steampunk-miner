/**
 * The tabs of the one base sheet (spec #678, ticket 686; HS: "one tabbed base panel with about 8
 * tabs from data"), registered and sealed like `screens`: a module adds a tab, never a layout
 * (design-system.md section 14). Each tab names itself in Progression's vocabulary where one
 * exists (`copy.places`: Outfitter, Patent Office, Hold, Ledger, Gearbox) and shows while its
 * `isShownOn` says so, so a tab waiting on a schedule row or a probe stays out of the bar. The tab
 * draws its own content inside the sheet's one scroll area and reads its own store.
 *
 * The kernel's own tabs (ticket 688: the Hold and the Ledger) are `KERNEL_SHEET_TABS` below, read
 * beside the registered ones; their content is mapped by id in `ui/sheet/kernelSheetPanels.tsx`,
 * so this list never imports a panel and the store's import of it stays free of a cycle.
 */
import type { ComponentType } from 'react'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { defineRegistry, entriesOf, type SealedRegistration } from '../../systems/registries/seal'
import { DESIGN_TOKENS } from '../../systems/views/designSystem'
import { KERNEL_SHEET_TAB_IDS } from '../../systems/views/kernelSheetTabIds'

export interface SheetTab {
  id: string
  /** The tab's label and the sheet's title while it shows: 3 words at most (`copy.titleWordsMax`). */
  title: string
  /** Tabs read left to right by order, then by id. */
  order: number
  /** Whether the tab shows on the bar now for the local player, read from the authority replica. */
  isShownOn(state: AuthorityState, playerId: string): boolean
  /** The tab's content, drawn in the sheet's scroll area; it takes no props. */
  Panel: ComponentType
}

/** What the bar and the store read of a tab; its content is drawn by `sheetPanelOf`. */
export type SheetTabHead = Omit<SheetTab, 'Panel'>

export const SHEET_TAB_REGISTRY = defineRegistry<SheetTab>('sheetTabs', sheetTabSealProblem)

/**
 * The kernel's tabs, on the bar everywhere: the Hold reads the cargo anywhere and sells it only at
 * the Sell bay, the Ledger opens the saves and holds the world while it shows (ticket 688). They
 * read after the Outfitter (10) and the Patent Office (20), #687.
 */
export const KERNEL_SHEET_TABS: readonly SheetTabHead[] = [
  {
    id: KERNEL_SHEET_TAB_IDS.hold,
    title: DESIGN_TOKENS.copy.places.hold,
    order: 30,
    isShownOn: () => true,
  },
  {
    id: KERNEL_SHEET_TAB_IDS.ledger,
    title: DESIGN_TOKENS.copy.places.ledger,
    order: 40,
    isShownOn: () => true,
  },
]

/** The tabs the bar shows `playerId` on `state`, the kernel's and the slices', in order. */
export function shownSheetTabsOn(state: AuthorityState, playerId: string): readonly SheetTabHead[] {
  return everySheetTab()
    .filter((tab) => tab.isShownOn(state, playerId))
    .sort(byOrderThenId)
}

export function sheetTabById(id: string): SheetTabHead | null {
  return everySheetTab().find((tab) => tab.id === id) ?? null
}

/** A slice's tab with its content; null for a kernel tab or an unknown id. */
export function registeredSheetTabById(id: string): SheetTab | null {
  return entriesOf(SHEET_TAB_REGISTRY).find((tab) => tab.id === id) ?? null
}

/** Why `id` names no tab; empty when it does. */
export function sheetTabIdProblems(id: unknown): string[] {
  if (typeof id !== 'string') return ['a sheet tab id is a string']
  return sheetTabById(id) === null ? [`no sheet tab "${id}" is kernel or registered`] : []
}

function everySheetTab(): SheetTabHead[] {
  return [...KERNEL_SHEET_TABS, ...entriesOf(SHEET_TAB_REGISTRY)]
}

function byOrderThenId(first: SheetTabHead, second: SheetTabHead): number {
  return first.order - second.order || first.id.localeCompare(second.id)
}

function sheetTabSealProblem(
  registrations: readonly SealedRegistration<SheetTab>[],
): string | null {
  const problems = registrations.map(({ entry }) => entry).flatMap(titleProblemsOf)
  return problems.length === 0 ? null : problems.join('; ')
}

function titleProblemsOf(tab: SheetTab): string[] {
  const words = tab.title.trim().split(/\s+/).filter(Boolean).length
  if (words === 0) return [`sheet tab "${tab.id}" has no title`]
  const max = DESIGN_TOKENS.copy.titleWordsMax
  return words > max ? [`sheet tab "${tab.id}" title "${tab.title}" is over ${max} words`] : []
}
