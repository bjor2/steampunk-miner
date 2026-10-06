/**
 * The Upgrade bay's track rows (#33 section 6, #37): the six tracks in #7's order, each with its level,
 * the next level's cost (`upgradePrice`, the same value `upgrade_purchased.cost` logs) and an
 * effect preview "before -> after" from `vehicleStatsAt` at this level and the next (the same
 * function as `upgrade_purchased.statsAfter`). `drill_tip` also says to which band of this planet
 * it drills at full speed (`P >= H`, #7).
 */
import type { AuthorityState } from '../authority/authorityState'
import { nextUpgradePrice } from '../authority/workshopRules'
import { trackIconIdOf } from '../art/artIds'
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
import { UI_ID_TEMPLATES } from './screenIds'

/**
 * The stats a track changes, keyed as `statsAfter` names them, with the screen text of all of
 * them and their canonical values as one JSON string for `data-exact`.
 */
export interface StatPreview {
  stats: Readonly<Record<string, AmountReading>>
  text: string
  exactText: string
}

export type BuyState = 'affordable' | 'money_short'

/**
 * The state badge on a row's icon (#158 "State badges"): a padlock while the thing is still to be
 * unlocked, a star once it is at its top; null for a plain row. Shapes, never colour alone.
 */
export type RowBadge = 'locked' | 'maxed' | null

/** The rim glint on an icon: the buy would be accepted now (#158 "affordable"). */
export function isBuyOpen(buy: ScreenButton): boolean {
  return buy.reason === null
}

export interface WorkshopRow {
  upgradeId: UpgradeId
  /** One vector icon per track (#44 `icon-track-<id>`, kebab-case per #52). */
  iconId: string
  label: string
  level: number
  cost: AmountReading
  effectBefore: StatPreview
  effectAfter: StatPreview
  buy: ScreenButton
  buyState: BuyState
  badge: RowBadge
  isBuyOpen: boolean
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

/** `money_short` when that is why the authority refuses the buy now; `affordable` otherwise. */
export function buyStateOf(buy: ScreenButton): BuyState {
  return buy.reason === 'money_short' ? 'money_short' : 'affordable'
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
    UI_ID_TEMPLATES.workshopUpgradeBuy(upgradeId),
    'Buy',
    buyUpgradeCommand(upgradeId),
  )
  return {
    upgradeId,
    iconId: trackIconIdOf(upgradeId),
    label: TRACK_LABELS[upgradeId],
    level: levels[upgradeId],
    cost: amountReading(nextUpgradePrice(state, playerId, upgradeId)),
    effectBefore: previewOf(levels, upgradeId),
    effectAfter: previewOf(next, upgradeId),
    buy,
    buyState: buyStateOf(buy),
    badge: null,
    isBuyOpen: isBuyOpen(buy),
    fullSpeedBand: upgradeId === 'drill_tip' ? fullSpeedBandOf(state.planet.index, levels) : null,
  }
}

function previewOf(levels: UpgradeLevels, upgradeId: UpgradeId): StatPreview {
  const canonical = canonicalStatsOf(vehicleStatsAt(levels))
  const names = STATS_OF_TRACK[upgradeId]
  return {
    stats: Object.fromEntries(names.map((stat) => [stat, statReading(canonical[stat])])),
    text: names.map((stat) => statReading(canonical[stat]).text).join(' / '),
    exactText: JSON.stringify(Object.fromEntries(names.map((stat) => [stat, canonical[stat]]))),
  }
}

function fullSpeedBandOf(planetIndex: number, levels: UpgradeLevels): number {
  const tip = vehicleStatsAt(levels).drillTip
  let deepest = 0
  for (let band = 1; band <= BAND_COUNT; band++) {
    if (cmp(tip, blockHardness(planetIndex, band)) >= 0) deepest = band
  }
  return deepest
}
