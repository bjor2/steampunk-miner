/**
 * The game store's collapse debug action (#43 Debug API), kept beside the store so it stays one
 * reason to change: `forceCollapse` submits `debug.forceCollapse`, so it replays and logs
 * `debug_command_applied`, and a call the authority would refuse throws with its problems.
 */
import { forceCollapseCommand } from '../systems/authority/collapse/collapseCommands'
import { submitUnlessRefused } from './authorityLink'

export interface CollapseDebugActions {
  /** Debug: starts the collapse of block `cx,cy#index` now, held whatever its lining. */
  forceCollapse(block: string): void
}

export function collapseDebugActionsOf(playerIdOf: () => string): CollapseDebugActions {
  return {
    forceCollapse: (block) => submitUnlessRefused(playerIdOf(), forceCollapseCommand(block)),
  }
}
