/**
 * Read-only or presentation only, so no command and no log line (docs/standards/feature-slices.md
 * 3.14, 3.18): the test piece is never part of the authority state.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { mountTestPiece, unmountTestPiece } from './store/testPieceStore'
import { describeExample } from './systems/describeExample'

export const exampleDebugActions: Readonly<Record<string, DebugAction>> = {
  describe: () => ({ ok: true, ...describeExample() }),
  mountTestPiece: () => okAfter(mountTestPiece),
  unmountTestPiece: () => okAfter(unmountTestPiece),
}

function okAfter(act: () => void): DebugResult {
  act()
  return { ok: true }
}
