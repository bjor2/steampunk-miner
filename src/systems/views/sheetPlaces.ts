/**
 * The places the base sheet holds (spec #678; ticket 768): Progression's vocabulary in
 * `copy.places`, the Outfitter, Patent Office, Hold, Ledger and Gearbox. A tab names itself with
 * its place's word (`ui/registries/sheetTabs.ts`), so a desktop key jumps to the tab that bears
 * the word, whoever registered it, and a place no tab bears yet (the Gearbox) is simply not there.
 * Pure.
 */
import { DESIGN_TOKENS, type DesignTokens } from './designSystem'

export type SheetPlace = keyof DesignTokens['copy']['places']

/** The tab of `place` among `tabs`, matched on the place's word; null while none bears it. */
export function tabAtPlace<T extends { title: string }>(
  tabs: readonly T[],
  place: SheetPlace,
  tokens: DesignTokens = DESIGN_TOKENS,
): T | null {
  const title = tokens.copy.places[place]
  return tabs.find((tab) => tab.title === title) ?? null
}
