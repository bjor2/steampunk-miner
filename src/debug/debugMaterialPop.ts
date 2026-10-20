/**
 * The debug API's material pop switch (ticket 614, #442): `ui.setMaterialPopMode` switches the
 * session between A and B as the panel does, so a spec drives it without the panel; it is logged
 * as `material_pop_mode_set` and, being presentation only, never marks the run. A read is unlogged.
 */
import { useGameStore } from '../store/gameStore'
import {
  isMaterialPopMode,
  MATERIAL_POP_MODES,
  type MaterialPopMode,
} from '../systems/materialPop/materialPopMode'
import type { DebugResult } from './debugScreens'

export interface DebugMaterialPop {
  /** `'A'` (no pop) or `'B'` (pop after the cell clears); anything else is refused. */
  setMaterialPopMode(mode: unknown): DebugResult
  getMaterialPopMode(): DebugResult<{ mode: MaterialPopMode }>
}

export function createDebugMaterialPop(): DebugMaterialPop {
  return {
    setMaterialPopMode: switchMaterialPopModeUnlessRefused,
    getMaterialPopMode: () => ({ ok: true, mode: useGameStore.getState().materialPopMode }),
  }
}

function switchMaterialPopModeUnlessRefused(mode: unknown): DebugResult {
  if (!isMaterialPopMode(mode)) return { ok: false, problems: [unknownModeProblem(mode)] }
  useGameStore.getState().switchMaterialPopMode(mode, 'debugApi')
  return { ok: true }
}

function unknownModeProblem(mode: unknown): string {
  return `material pop mode ${JSON.stringify(mode)} is not one of ${MATERIAL_POP_MODES.join(', ')}`
}
