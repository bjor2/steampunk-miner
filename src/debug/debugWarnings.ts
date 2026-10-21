/**
 * The debug read of the warning layer (spec #678, ticket 685): the edge glow the screen draws,
 * the tier each readout's bell last fired at and every firing of the run in order, so a recorded
 * run can show each ladder tier fired exactly once. Presentation only: no command, no log line,
 * nothing a save or the digest sees.
 */
import { useGameStore } from '../store/gameStore'
import { readFiredWarnings } from '../store/warningBroadcast'
import type { EdgeGlow, WarningFiring, WarningWatch } from '../systems/views/warningWatch'
import type { DebugResult } from './debugScreens'

export interface WarningsReading {
  glow: EdgeGlow
  watch: WarningWatch
  fired: WarningFiring[]
}

export function warningsNow(): DebugResult<{ warnings: WarningsReading }> {
  const game = useGameStore.getState()
  return {
    ok: true,
    warnings: { glow: game.edgeGlow, watch: game.warningWatch, fired: [...readFiredWarnings()] },
  }
}
