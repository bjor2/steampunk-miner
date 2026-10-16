/**
 * The HUD's debug staging (#500, `systems/views/hudStaging.ts`): the one value the debug API
 * writes and the HUD read lays over the model. `NO_HUD_STAGING` in every normal run; never saved,
 * logged or replayed.
 */
import { NO_HUD_STAGING, type HudStaging } from '../systems/views/hudStaging'

let staging: HudStaging = NO_HUD_STAGING

export function stageHudForDebug(next: HudStaging): void {
  staging = next
}

export function readHudStaging(): HudStaging {
  return staging
}
