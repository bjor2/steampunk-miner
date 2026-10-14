/**
 * What the three drain combos answer at the mineral drain's decision points (#162 milestone
 * combos; ticket 206 "Combo templates"; GD lock on #206). The drain consults `reach` and
 * `targetOrder` (extraction's `drainHooks.ts`); every answer only ranks the cells the drain found
 * drainable or widens its radius in whole cells under the 12-cell cap, so none makes air or takes
 * a gated or core cell, and what they pay is still held to the trip's 15% clamp where the take
 * happens. Each answers nothing until the player owns the combo.
 *
 * - **Assay drain:** the highest-value drainable cells first.
 * - **Cored drain:** with a vein the corer sampled on this planet within the cap of the drain, its
 *   reach grows by the grade's share of the cap and the sampled ore goes first, nearest the plug.
 * - **Lodestone drain:** a drain started inside the live beacon's gather radius reaches as far by
 *   grade, and takes the gathered cells first, nearest the beacon.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { ECONOMY } from '../../../systems/economy/economy'
import type { ItemHookContext } from '../../../systems/registries/itemHooks'
import type { LiveBeacon } from '../../../systems/registries/liveBeacon'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { closedHeadroomAt, gradeOf } from './comboGrades'
import { CORED_DRAIN_ID, sampledVeinOf, type SampledVein } from './sampledVein'
import { valueRankScoresOf } from './valueRanks'

export const ASSAY_DRAIN_ID = 'combo.assay_drain'
export const LODESTONE_DRAIN_ID = 'combo.lodestone_drain'

export function assayDrainOrderOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number[] | null {
  if (gradeOf(state, playerId, ASSAY_DRAIN_ID) === 0) return null
  return valueRankScoresOf(state, ctx.candidates)
}

export function coredDrainReachOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number | null {
  const grade = gradeOf(state, playerId, CORED_DRAIN_ID)
  const vein = grade === 0 ? null : sampledVeinOf(state, playerId)
  if (vein === null || !isWithinCap(ctx.origin, tileOfVein(vein))) return null
  return reachClosedAt(grade)
}

export function coredDrainOrderOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number[] | null {
  const vein =
    gradeOf(state, playerId, CORED_DRAIN_ID) === 0 ? null : sampledVeinOf(state, playerId)
  if (vein === null) return null
  return ctx.candidates.map((tile) => veinScoreOf(state, vein, tile))
}

export function lodestoneDrainReachOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number | null {
  const grade = gradeOf(state, playerId, LODESTONE_DRAIN_ID)
  if (grade === 0 || !isStartedInGather(ctx)) return null
  return reachClosedAt(grade)
}

export function lodestoneDrainOrderOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number[] | null {
  if (gradeOf(state, playerId, LODESTONE_DRAIN_ID) === 0 || !isStartedInGather(ctx)) return null
  const beacon = ctx.beacon as LiveBeacon
  return ctx.candidates.map((tile) => gatheredScoreOf(beacon, tile))
}

/** The cells a grade adds to the drain's radius: its share of the 12-cell cap. */
function reachClosedAt(grade: number): number {
  return closedHeadroomAt(grade, ECONOMY.itemHookCaps.reachCellsMax)
}

function isStartedInGather({ beacon, origin }: ItemHookContext): boolean {
  return (
    beacon !== undefined && distanceSqOf(origin, beacon.tile) <= squareOf(beacon.gatherRadiusTiles)
  )
}

/** Ore of the sampled kind scores above every other cell, the nearer the plug the higher. */
function veinScoreOf(state: AuthorityState, vein: SampledVein, tile: TilePoint): number {
  if (oreTypeAtTile(state, tile)?.id !== vein.oreId) return 0
  return farthestScoreOf() - distanceSqOf(tile, tileOfVein(vein))
}

/** A gathered cell scores above every other cell, the nearer the beacon the higher. */
function gatheredScoreOf(beacon: LiveBeacon, tile: TilePoint): number {
  const distanceSq = distanceSqOf(tile, beacon.tile)
  const radiusSq = squareOf(beacon.gatherRadiusTiles)
  return distanceSq > radiusSq ? 0 : radiusSq - distanceSq + 1
}

/** Above the squared distance of any two tiles within the cap of one origin: the plug's score. */
function farthestScoreOf(): number {
  const across = 2 * ECONOMY.itemHookCaps.reachCellsMax
  return 2 * across * across + 1
}

function isWithinCap(origin: TilePoint, tile: TilePoint): boolean {
  const reach = ECONOMY.itemHookCaps.reachCellsMax
  return distanceSqOf(origin, tile) <= reach * reach
}

function tileOfVein({ tx, ty }: SampledVein): TilePoint {
  return { tx, ty }
}

function distanceSqOf(a: TilePoint, b: TilePoint): number {
  return squareOf(a.tx - b.tx) + squareOf(a.ty - b.ty)
}

function squareOf(value: number): number {
  return value * value
}
