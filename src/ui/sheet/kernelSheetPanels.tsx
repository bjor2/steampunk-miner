/**
 * The content of the kernel's own sheet tabs (ticket 688), mapped by id beside the tab list in
 * `ui/registries/sheetTabs.ts` rather than inside it: a panel reads the store, and the store reads
 * that list, so keeping the panels here keeps the import graph free of a cycle. A slice's tab
 * carries its own `Panel`.
 */
import type { ComponentType } from 'react'
import { KERNEL_SHEET_TAB_IDS, type KernelSheetTabId } from '../../systems/views/kernelSheetTabIds'
import { HoldSheetPanel } from '../hold/HoldSheetPanel'
import { LedgerSheetPanel } from '../ledger/LedgerSheetPanel'
import { registeredSheetTabById } from '../registries/sheetTabs'

const KERNEL_SHEET_PANELS: Readonly<Record<KernelSheetTabId, ComponentType>> = {
  [KERNEL_SHEET_TAB_IDS.hold]: HoldSheetPanel,
  [KERNEL_SHEET_TAB_IDS.ledger]: LedgerSheetPanel,
}

/** What the sheet draws for a tab: the kernel's panel, or the slice's; null for an unknown id. */
export function sheetPanelOf(tabId: string): ComponentType | null {
  if (isKernelSheetTabId(tabId)) return KERNEL_SHEET_PANELS[tabId]
  return registeredSheetTabById(tabId)?.Panel ?? null
}

function isKernelSheetTabId(tabId: string): tabId is KernelSheetTabId {
  return Object.hasOwn(KERNEL_SHEET_PANELS, tabId)
}
