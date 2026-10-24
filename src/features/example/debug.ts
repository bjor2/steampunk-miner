/**
 * Read-only or presentation only, so no command and no log line (docs/standards/feature-slices.md
 * 3.14, 3.18): the test piece is never part of the authority state.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { sampleMerchantCountProblems, showSampleMerchants } from './store/bayPanelProbeStore'
import { actedCardId, hideSheetProbeTabs, showSheetProbeTabs } from './store/sheetProbeStore'
import { mountTestPiece, unmountTestPiece } from './store/testPieceStore'
import { describeExample } from './systems/describeExample'

export const exampleDebugActions: Readonly<Record<string, DebugAction>> = {
  describe: () => ({ ok: true, ...describeExample() }),
  mountTestPiece: () => okAfter(mountTestPiece),
  unmountTestPiece: () => okAfter(unmountTestPiece),
  // The base sheet's probe tabs (ticket 686): shown, hidden, and the card whose act ran last.
  showSheetTabs: () => okAfter(showSheetProbeTabs),
  hideSheetTabs: () => okAfter(hideSheetProbeTabs),
  getActedCard: () => ({ ok: true, cardId: actedCardId() }),
  // The Sell bay's sample merchants (ticket 845): the first `count` of five, 0 hides them all.
  showBayPanels: (count) => showBayPanels(count),
}

function showBayPanels(count: unknown): DebugResult {
  const problems = sampleMerchantCountProblems(count)
  if (problems.length > 0) return { ok: false, problems }
  return okAfter(() => showSampleMerchants(count as number))
}

function okAfter(act: () => void): DebugResult {
  act()
  return { ok: true }
}
