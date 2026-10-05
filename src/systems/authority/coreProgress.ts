/**
 * How far the session has got with the core of the planet it is on (decision #10): when the first
 * core tile broke (`core_reached`, the start of `core_completed.durationTicks`), how many core
 * tiles are gone (`core_tile_harvested.tilesRemaining`), and whether the bay has reached the
 * fragments travel needs (`core_completed`, once per planet). Travel starts the next planet's
 * progress fresh; the platform's `core_drive` look is the platform's and stays (#8).
 */
import { isJsonObject, isWholeNumber } from './payloadFields'

export interface CoreProgress {
  /** The tick the first core tile of this planet broke; null before. */
  reachedTick: number | null
  harvestedTiles: number
  isCompleted: boolean
}

export const NEW_CORE_PROGRESS: CoreProgress = {
  reachedTick: null,
  harvestedTiles: 0,
  isCompleted: false,
}

export function coreProgressProblems(core: unknown, path: string): string[] {
  const isValid =
    isJsonObject(core) &&
    (core.reachedTick === null || isWholeNumber(core.reachedTick)) &&
    isWholeNumber(core.harvestedTiles) &&
    typeof core.isCompleted === 'boolean'
  return isValid ? [] : [`${path} must hold a reachedTick, whole harvestedTiles and isCompleted`]
}
