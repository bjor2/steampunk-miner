/**
 * The kernel's own tabs on the base sheet (spec #678, ticket 688), named from `copy.places`: the
 * Hold (cargo, the Sell bay's ore panel as was) and the Ledger (saves, the pause menu's save page
 * as was). Slices register theirs with a `<slice>.` id; these ids carry no prefix, so neither can
 * collide with one. The tabs themselves are `KERNEL_SHEET_TABS` in `ui/registries/sheetTabs.ts`.
 */
export const KERNEL_SHEET_TAB_IDS = {
  hold: 'hold',
  ledger: 'ledger',
} as const

export type KernelSheetTabId = (typeof KERNEL_SHEET_TAB_IDS)[keyof typeof KERNEL_SHEET_TAB_IDS]
