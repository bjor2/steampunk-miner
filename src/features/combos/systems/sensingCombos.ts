/**
 * What the three sensing combos answer at their partner item's decision point (#162 milestone
 * combos; ticket 206 "Combo templates"; GD lock on #206, decisions 2 and 6). Each reads its sensing
 * parent's current value off the tree's ladder, held by a magnetic field like the lane's own
 * reach (`sensingReachAt`, #290), and answers nothing until the player owns the combo.
 *
 * - **Magnetic survey** (the ore-shifter's `dragTarget`): the shifter drags the nodules nearest the
 *   densest draggable cluster inside the echo sounder's radius first (`densestOreClusterOf`).
 * - **Lens corer** (the corer's `aim`): the highest-value cell the corer could plug.
 * - **Alarm shield** (the steam shield's `autoFire`): one fire on a lunge warning inside the
 *   periscope's radius, widened by the grade's share of the way to the 12-cell cap. The mobility
 *   lane holds it to the warnings and the charges, and to its auto core's holds.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { sensingReachAt } from '../../../systems/authority/magnetic/sensingReach'
import { densestOreClusterOf, lungeWarningsOf } from '../../../systems/authority/sensingQueries'
import { ECONOMY } from '../../../systems/economy/economy'
import type { ItemHookContext } from '../../../systems/registries/itemHooks'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { closedHeadroomAt, gradeOf } from './comboGrades'
import { parentMagnitudeAt, parentMarkOf, passiveReachAt } from './parentValues'
import { valueRankScoresOf } from './valueRanks'

export const MAGNETIC_SURVEY_ID = 'combo.magnetic_survey'
export const LENS_CORER_ID = 'combo.lens_corer'
export const ALARM_SHIELD_ID = 'combo.alarm_shield'

const ECHO_SOUNDER = 'power.echo_sounder'
const THREAT_PERISCOPE = 'passive.threat_periscope'
/** The ore-shifter as the gates know it: its terrain edit's `source`. */
const ORE_SHIFTER_TOOL = 'terrain-tools.ore_shifter'

export function magneticSurveyTargetOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number[] | null {
  if (gradeOf(state, playerId, MAGNETIC_SURVEY_ID) === 0) return null
  const radius = sensedRadiusOf(state, ctx.origin, echoRadiusOf(state, playerId))
  const asker = { playerId, tool: ORE_SHIFTER_TOOL }
  const cluster = densestOreClusterOf(state, ctx.origin, radius, asker)
  if (cluster === null) return null
  return ctx.candidates.map((tile) => -distanceSqOf(tile, cluster.tile))
}

export function lensCorerAimOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number[] | null {
  if (gradeOf(state, playerId, LENS_CORER_ID) === 0) return null
  return valueRankScoresOf(state, ctx.candidates)
}

export function alarmShieldFiresOf(
  state: AuthorityState,
  playerId: string,
  ctx: ItemHookContext,
): number | null {
  const grade = gradeOf(state, playerId, ALARM_SHIELD_ID)
  if (grade === 0) return null
  const radius = alarmRadiusAt(grade, periscopeRadiusOf(state, playerId))
  const warnings = lungeWarningsOf(state, playerId, sensedRadiusOf(state, ctx.origin, radius))
  return warnings.length === 0 ? null : 1
}

/** The periscope's radius plus the grade's share of the way to the cap; never past the cap. */
export function alarmRadiusAt(grade: number, periscopeRadius: number): number {
  const cap = ECONOMY.itemHookCaps.reachCellsMax
  const radius = Math.min(cap, periscopeRadius)
  return radius + closedHeadroomAt(grade, cap - radius)
}

function echoRadiusOf(state: AuthorityState, playerId: string): number {
  const mark = parentMarkOf(state, playerId, ECHO_SOUNDER)
  return parentMagnitudeAt(ECHO_SOUNDER, mark) ?? ECONOMY.itemHookCaps.reachCellsMax
}

function periscopeRadiusOf(state: AuthorityState, playerId: string): number {
  const mark = parentMarkOf(state, playerId, THREAT_PERISCOPE)
  return passiveReachAt(THREAT_PERISCOPE, mark) ?? 0
}

/** A sensing radius as the lane reads it from `tile`: a magnetic field holds it back. */
function sensedRadiusOf(state: AuthorityState, tile: TilePoint, radius: number): number {
  return sensingReachAt(state, tile, radius)
}

function distanceSqOf(a: TilePoint, b: TilePoint): number {
  const dx = a.tx - b.tx
  const dy = a.ty - b.ty
  return dx * dx + dy * dy
}
