/**
 * The game store's material pop slice (ticket 614, #442): which pop the session shows, A (no pop)
 * or B (pop after the cell clears). Client-only presentation: the mode is never a command, never
 * saved, never stored in the browser and never in the digest, so it lasts one session and a switch
 * changes nothing the authority holds. Every start and switch is logged as
 * `material_pop_mode_set`, so a run's lines say which pop was on.
 */
import { getRunLog } from '../logging/runLog'
import {
  DEFAULT_MATERIAL_POP_MODE,
  type MaterialPopMode,
  type MaterialPopModeSource,
} from '../systems/materialPop/materialPopMode'
import { readAuthorityState } from './authorityLink'

export interface MaterialPopValues {
  materialPopMode: MaterialPopMode
}

export interface MaterialPopActions {
  /** The session's start: the URL's mode, or A when it asks none. */
  startMaterialPopMode(asked: MaterialPopMode | null): void
  /** A live switch from the debug flag panel or the debug API. */
  switchMaterialPopMode(mode: MaterialPopMode, source: MaterialPopModeSource): void
}

type SliceHost = MaterialPopValues &
  MaterialPopActions & { playerId: string; planetTier: number; depthTiles: number }

type SetSlice = (partial: Partial<MaterialPopValues>) => void

export const STARTING_MATERIAL_POP: MaterialPopValues = {
  materialPopMode: DEFAULT_MATERIAL_POP_MODE,
}

export function materialPopActionsOf(set: SetSlice, get: () => SliceHost): MaterialPopActions {
  return {
    startMaterialPopMode: (asked) =>
      get().switchMaterialPopMode(asked ?? DEFAULT_MATERIAL_POP_MODE, sourceOfAsked(asked)),
    switchMaterialPopMode: (mode, source) => {
      set({ materialPopMode: mode })
      recordMaterialPopMode(get(), source)
    },
  }
}

function sourceOfAsked(asked: MaterialPopMode | null): MaterialPopModeSource {
  return asked === null ? 'default' : 'url'
}

function recordMaterialPopMode(host: SliceHost, source: MaterialPopModeSource): void {
  const place = { playerId: host.playerId, planet: host.planetTier, depthTiles: host.depthTiles }
  getRunLog().record({ ...place, tick: readAuthorityState().tick }, 'material_pop_mode_set', {
    mode: host.materialPopMode,
    source,
  })
}
