/**
 * The lava the authority is moving (spec #113: lava flow runs on the server and is shared): the
 * loose lava cells, lowest first, and the tick of their next step. Lava that rests leaves the list;
 * the drill breaking into a pocket puts its cells back. Plain JSON, so it is in the snapshot and
 * the digest; emptied with the world on every planet.
 */
import { LAVA_FLOW_STEP_TICKS } from '../../../constants/balance'
import type { TilePoint } from '../../world/tileGrid'
import { isJsonObject, isWholeNumber } from '../payloadFields'

export interface LavaState {
  loose: readonly TilePoint[]
  /** The tick of the next flow step, or null when no lava is loose. */
  nextStepTick: number | null
}

export const NO_LOOSE_LAVA: LavaState = { loose: [], nextStepTick: null }

/** More lava loose from `tick`; a step already due keeps its tick. */
export function withLooseLava(
  lava: LavaState,
  tiles: readonly TilePoint[],
  tick: number,
): LavaState {
  if (tiles.length === 0) return lava
  const known = new Set(lava.loose.map(keyOf))
  const added = tiles.filter((tile) => !known.has(keyOf(tile)))
  return {
    loose: [...lava.loose, ...added],
    nextStepTick: lava.nextStepTick ?? tick + LAVA_FLOW_STEP_TICKS,
  }
}

/** After a step at `tick`: the lava still loose, stepping again a step later. */
export function lavaAfterStep(loose: readonly TilePoint[], tick: number): LavaState {
  if (loose.length === 0) return NO_LOOSE_LAVA
  return { loose, nextStepTick: tick + LAVA_FLOW_STEP_TICKS }
}

export function portableLavaOf(lava: LavaState): LavaState {
  return { loose: lava.loose.map((tile) => ({ ...tile })), nextStepTick: lava.nextStepTick }
}

export function portableLavaProblems(lava: unknown, path: string): string[] {
  const isValid =
    isJsonObject(lava) &&
    Array.isArray(lava.loose) &&
    lava.loose.every(isTilePoint) &&
    (lava.nextStepTick === null || isWholeNumber(lava.nextStepTick))
  return isValid ? [] : [`${path} must hold loose lava tiles and a next step tick or null`]
}

function isTilePoint(tile: unknown): boolean {
  return isJsonObject(tile) && Number.isSafeInteger(tile.tx) && Number.isSafeInteger(tile.ty)
}

function keyOf(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`
}
