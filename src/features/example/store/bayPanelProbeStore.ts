/**
 * How many of the example's sample merchants the Sell bay shows (ticket 845): none until a spec
 * asks. Presentation only, like the sheet probe tabs (feature-slices.md 3.18): the debug action sets
 * it for the kernel e2e and the screenshot suite, and it is never saved, logged or part of
 * `GameState`.
 */
import { create } from 'zustand'

/** The sample merchants the example registers; a spec shows the first `count` of them. */
export const SAMPLE_MERCHANT_COUNT = 5

interface BayPanelProbeState {
  shownMerchants: number
}

export const useBayPanelProbeStore = create<BayPanelProbeState>(() => ({ shownMerchants: 0 }))

/** Why `count` is no number of sample merchants to show; empty when it is one. */
export function sampleMerchantCountProblems(count: unknown): string[] {
  if (isSampleMerchantCount(count)) return []
  return [`a sample merchant count is a whole number from 0 to ${SAMPLE_MERCHANT_COUNT}`]
}

/** Shows the first `count` sample merchants; the caller has checked the count. */
export function showSampleMerchants(count: number): void {
  useBayPanelProbeStore.setState({ shownMerchants: count })
}

/** Whether the sample merchant at `place` (1-based) shows now. */
export function isSampleMerchantShown(place: number): boolean {
  return place <= useBayPanelProbeStore.getState().shownMerchants
}

function isSampleMerchantCount(count: unknown): boolean {
  return (
    Number.isInteger(count) && (count as number) >= 0 && (count as number) <= SAMPLE_MERCHANT_COUNT
  )
}
