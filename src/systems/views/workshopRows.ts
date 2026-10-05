/**
 * The workshop panel's rows (#33 section 6): the six tracks in #7's order, each with its level,
 * the next level's cost (`upgradePrice`, the same value `upgrade_purchased.cost` logs) and an
 * effect preview "before -> after" from `vehicleStatsAt` at this level and the next (the same
 * function as `upgrade_purchased.statsAfter`). `drill_tip` also says to which band of this planet
 * it drills at full speed (`P >= H`, #7).
 */
import type { AuthorityState } from '../authority/authorityState'
import { nextUpgradePrice } from '../authority/workshopRules'
import { blockHardness } from '../economy/oreEconomy'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { vehicleStatsAt, type UpgradeLevels } from '../economy/vehicleStats'
import { cmp } from '../money'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { canonicalStatsOf } from '../vehicle/vehicleStatsView'
import { BAND_COUNT } from '../world/planetGeometry'
import {
  amountReading,
  commandButton,
  statReading,
  type AmountReading,
  type ScreenButton,
} from './viewParts'

/** The canonical stats a track changes, as `statsAfter` names them. */
export type StatPreview = Readonly<Record<string, AmountReading>>

export type BuyState = 'affordable' | 'money_short'

export interface WorkshopRow {
  upgradeId: UpgradeId
  label: string
  level: number
  cost: AmountReading
  effectBefore: StatPreview
  effectAfter: StatPreview
  buy: ScreenButton
  buyState: BuyState
  /** `drill_tip` only: the deepest band of this planet its tip cuts at full speed (0: none). */
  fullSpeedBand: number | null
}

const TRACK_LABELS: Readonly<Record<UpgradeId, string>> = {
  drill_power: 'Drill power',
  drill_tip: 'Drill tip',
  engine: 'Engine',
  boiler: 'Boiler',
  cargo_hold: 'Cargo hold',
  hull: 'Hull',
}

const STATS_OF_TRACK: Readonly<Record<UpgradeId, readonly string[]>> = {
  drill_power: ['drillPower'],
  drill_tip: ['drillTip'],
  engine: ['speedMax', 'accel', 'thrustToWeight'],
  boiler: ['energyMax'],
  cargo_hold: ['cargoCapacity'],
  hull: ['hullMax'],
}

export function workshopRowsOf(state: AuthorityState, playerId: string): WorkshopRow[] {
  const levels = state.players[playerId].vehicle.levels
  return UPGRADE_IDS.map((upgradeId) => workshopRowOf(state, playerId, levels, upgradeId))
}

/** The stats a track changes, as the preview shows them; specs compare it with `statsAfter`. */
export function statsOfTrack(upgradeId: UpgradeId): readonly string[] {
  return STATS_OF_TRACK[upgradeId]
}

function workshopRowOf(
  state: AuthorityState,
  playerId: string,
  levels: UpgradeLevels,
  upgradeId: UpgradeId,
): WorkshopRow {
  const next = { ...levels, [upgradeId]: levels[upgradeId] + 1 }
  const buy = commandButton(
    state,
    playerId,
    `workshop-upgrade-${upgradeId}-buy`,
    'Buy',
    buyUpgradeCommand(upgradeId),
  )
  return {
    upgradeId,
    label: TRACK_LABELS[upgradeId],
    level: levels[upgradeId],
    cost: amountReading(nextUpgradePrice(state, playerId, upgradeId)),
    effectBefore: previewOf(levels, upgradeId),
    effectAfter: previewOf(next, upgradeId),
    buy,
    buyState: buy.reason === 'money_short' ? 'money_short' : 'affordable',
    fullSpeedBand: upgradeId === 'drill_tip' ? fullSpeedBandOf(state.planet.index, levels) : null,
  }
}

function previewOf(levels: UpgradeLevels, upgradeId: UpgradeId): StatPreview {
  const stats = canonicalStatsOf(vehicleStatsAt(levels))
  return Object.fromEntries(
    STATS_OF_TRACK[upgradeId].map((stat) => [stat, statReading(stats[stat])]),
  )
}

function fullSpeedBandOf(planetIndex: number, levels: UpgradeLevels): number {
  const tip = vehicleStatsAt(levels).drillTip
  let deepest = 0
  for (let band = 1; band <= BAND_COUNT; band++) {
    if (cmp(tip, blockHardness(planetIndex, band)) >= 0) deepest = band
  }
  return deepest
}
