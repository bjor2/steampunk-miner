/**
 * The Upgrade bay's track rows (#33 section 6, #37): the six tracks in #7's order, each with its
 * stored step and its major and pip as text (#180), the next step's cost (`stepPrice`, the same
 * value `upgrade_purchased.cost` logs) and an effect preview "before -> after" from
 * `vehicleStatsAt` at this step and the next (the same function as `upgrade_purchased.statsAfter`). `drill_tip` also says to which band of this planet
 * it drills at full speed (`P >= H`, #7). The engine has no max level (ticket 553): its row shows
 * the ratio of its top speed to k times the drill's cut speed in the planet's hardest band
 * (#418's band), and says plainly when the next purchase is worth zero there, as it is still sold.
 */
import type { AuthorityState } from '../authority/authorityState'
import { engineParityRatioAt, isEngineStepWorthZero } from '../authority/travelSpeed'
import { nextUpgradePrice } from '../authority/workshopRules'
import { trackIconIdOf } from '../art/artIds'
import { blockHardness } from '../economy/oreEconomy'
import { UPGRADE_IDS, type UpgradeId } from '../economy/economyDefinition'
import { vehicleStatsAt, type UpgradeLevels } from '../economy/vehicleStats'
import { cmp, toFixedText } from '../money'
import { ECONOMY } from '../economy/economy'
import { buyUpgradeCommand } from '../platform/platformCommands'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { canonicalStatsOf } from '../vehicle/vehicleStatsView'
import { BAND_COUNT } from '../world/planetGeometry'
import { trackItemOf } from '../registries/kernelItems'
import { itemCardOf, SHOP_SOURCE, type ItemCardModel } from './itemCardModel'
import {
  amountReading,
  commandButton,
  statReading,
  type AmountReading,
  type ScreenButton,
} from './viewParts'
import { UI_ID_TEMPLATES } from './screenIds'
import { stepLevelText } from './stepLevelText'

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
  /** The stored step, `10L + k`. */
  level: number
  /** "13" at a major, "13 · 4/9" on its pips; the engine adds its parity ratio (ticket 553). */
  levelText: string
  cost: AmountReading
  effectBefore: StatPreview
  effectAfter: StatPreview
  buy: ScreenButton
  buyState: BuyState
  badge: RowBadge
  isBuyOpen: boolean
  /** `drill_tip` only: the deepest band of this planet its tip cuts at full speed (0: none). */
  fullSpeedBand: number | null
  /** The kernel item card this row draws as, compact (K7 #199). */
  card: ItemCardModel
}

const TRACK_LABELS: Readonly<Record<UpgradeId, string>> = {
  drill_power: 'Drill power',
  drill_tip: 'Drill tip',
  engine: 'Engine',
  boiler: 'Boiler',
  cargo_hold: 'Cargo hold',
  hull: 'Hull',
}

/**
 * What the engine row says while its next purchase is worth zero (HS on #551, ticket 553): the
 * step is sold, never hidden or refused, so the card says why it buys nothing yet.
 */
export function engineWorthZeroText(): string {
  return (
    "worth zero: No extra speed until your drill's cut speed is within reach of the engine's " +
    `top speed (needs the engine above ${parityKText()}× the drill's cut speed). Raises your top ` +
    'speed once it is.'
  )
}

/** "top speed 0.62× of 1.5× cut": `speedMax / (k * cutSpeed)` in the hardest band. */
export function engineParityText(ratio: number): string {
  return `top speed ${ratioText(ratio)}× of ${parityKText()}× cut`
}

/** Two decimals, and "<0.01" under them, so a far-outrun engine never reads a flat 0. */
function ratioText(ratio: number): string {
  return ratio < SMALLEST_SHOWN_RATIO ? `<${SMALLEST_SHOWN_RATIO}` : ratio.toFixed(2)
}

const SMALLEST_SHOWN_RATIO = 0.01

/** k as plain decimals, "1.5", with no trailing zeros. */
function parityKText(): string {
  return toFixedText(ECONOMY.drill.travelParityK, 2).replace(/\.?0+$/, '')
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
    buyUpgradeCommand(upgradeId, CLICK_CHAIN),
  )
  const cost = amountReading(nextUpgradePrice(state, playerId, upgradeId))
  const iconId = trackIconIdOf(upgradeId)
  const label = TRACK_LABELS[upgradeId]
  return {
    upgradeId,
    iconId,
    label,
    level: levels[upgradeId],
    levelText: levelTextOf(state, playerId, levels, upgradeId),
    cost,
    effectBefore: previewOf(levels, upgradeId),
    effectAfter: previewOf(next, upgradeId),
    buy,
    buyState: buyStateOf(buy),
    badge: null,
    isBuyOpen: isBuyOpen(buy),
    fullSpeedBand: upgradeId === 'drill_tip' ? fullSpeedBandOf(state.planet.index, levels) : null,
    card: itemCardOf(state, playerId, {
      item: trackItemOf(upgradeId),
      iconId,
      name: label,
      cost,
      level: levels[upgradeId],
      buy,
      source: SHOP_SOURCE,
    }),
  }
}

function levelTextOf(
  state: AuthorityState,
  playerId: string,
  levels: UpgradeLevels,
  upgradeId: UpgradeId,
): string {
  const text = stepLevelText(levels[upgradeId])
  return upgradeId === 'engine' ? withEngineParity(state, playerId, text) : text
}

/** The step text, the parity ratio where the drill cuts the hardest band, and a worth-zero step. */
function withEngineParity(state: AuthorityState, playerId: string, text: string): string {
  const ratio = engineParityRatioAt(state, playerId)
  const parts = ratio === null ? [text] : [text, engineParityText(ratio)]
  if (isEngineStepWorthZero(state, playerId)) parts.push(engineWorthZeroText())
  return parts.join(' · ')
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
