/**
 * The tabs of the one base sheet (spec #678, ticket 686; HS: "one tabbed base panel with about 8
 * tabs from data"), registered and sealed like `screens`: a module adds a tab, never a layout
 * (design-system.md section 14). Each tab names itself in Progression's vocabulary where one
 * exists (`copy.places`: Outfitter, Patent Office, Hold, Ledger, Gearbox) and shows while its
 * `isShownOn` says so, so a tab waiting on a schedule row or a probe stays out of the bar. The tab
 * draws its own content inside the sheet's one scroll area and reads its own store.
 */
import type { ComponentType } from 'react'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { defineRegistry, entriesOf, type SealedRegistration } from '../../systems/registries/seal'
import { DESIGN_TOKENS } from '../../systems/views/designSystem'

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

export const SHEET_TAB_REGISTRY = defineRegistry<SheetTab>('sheetTabs', sheetTabSealProblem)

/** The tabs the bar shows `playerId` on `state`, in order. */
export function shownSheetTabsOn(state: AuthorityState, playerId: string): readonly SheetTab[] {
  return [...entriesOf(SHEET_TAB_REGISTRY)]
    .filter((tab) => tab.isShownOn(state, playerId))
    .sort(byOrderThenId)
}

export function sheetTabById(id: string): SheetTab | null {
  return entriesOf(SHEET_TAB_REGISTRY).find((tab) => tab.id === id) ?? null
}

/** Why `id` names no registered tab; empty when it does. */
export function sheetTabIdProblems(id: unknown): string[] {
  if (typeof id !== 'string') return ['a sheet tab id is a string']
  return sheetTabById(id) === null ? [`no slice registered the sheet tab "${id}"`] : []
}

function byOrderThenId(first: SheetTab, second: SheetTab): number {
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
