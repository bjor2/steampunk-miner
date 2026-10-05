/**
 * `selectUpgradeBayModel` (#37 Upgrade bay screen, #58): the six vehicle tracks in #7's order,
 * each with its icon, level, next cost, effect "before -> after" and Buy; then the Casing row
 * (#41, Game Director's scope review on #54), which is not a vehicle track: its grade "G -> G+1",
 * next cost and Buy; then Repair with its cost; and the live preview hook, under the shared header
 * and footer.
 *
 * The preview is presentation only (#37): with a track's row focused it highlights that track and
 * shows the visual tier the purchase would give; the Casing row, like any other control, leaves
 * the preview on the vehicle as it is, because casing is not a hull part. Focus is UI state, so
 * moving it never touches the authority or the digest.
 *
 * The quick action belongs to the Sell bay; here it is a disabled sign carrying `wrong_bay`
 * (#40), never a focus stop.
 */
import type { AuthorityState } from '../authority/authorityState'
import { nextCasingPrice } from '../authority/casingRules'
import { repairCostOf } from '../authority/platformServices'
import type { UpgradeId } from '../economy/economyDefinition'
import { visualTier, type UpgradeLevels } from '../economy/vehicleStats'
import {
  buyCasingGradeCommand,
  quickServiceCommand,
  repairHullCommand,
} from '../platform/platformCommands'
import { hullGaugeText } from '../vehicle/vehicleReadout'
import { statsOfVehicle } from '../vehicle/vehicleState'
import {
  bayFooterOf,
  bayHeaderOf,
  footerButtonsOf,
  stopIn,
  type BayFooter,
  type BayHeader,
  type BayUiState,
} from './bayFrame'
import { focusOnScreen, type FocusStop } from './menuFocus'
import { UI_IDS } from './screenIds'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, workshopRowsOf, type BuyState, type WorkshopRow } from './workshopRows'

export interface CasingRow {
  /** The seventh icon (#54 scope review), drawn by the shop screens ticket. */
  iconId: string
  label: string
  grade: number
  gradeAfter: number
  /** "G -> G+1", the before and after of the next buy. */
  gradeText: string
  cost: AmountReading
  buy: ScreenButton
  buyState: BuyState
}

export interface RepairReading {
  hullText: string
  button: ScreenButton
  cost: AmountReading
}

/** What the live vehicle preview shows for the focused row (#37). */
export interface UpgradePreview {
  /** The track the focused row would raise; null for the Casing row and every other control. */
  highlight: UpgradeId | null
  /** The visual tier after the focused track's purchase; the current tier otherwise. */
  visualTier: number
}

export interface UpgradeBayModel {
  header: BayHeader
  tracks: WorkshopRow[]
  casing: CasingRow
  repair: RepairReading
  visualTier: number
  preview: UpgradePreview
  /** "Sell, repair and recharge" is the Sell bay's: disabled here with `wrong_bay`. */
  quickService: ScreenButton
  footer: BayFooter
  /** Every focusable button in reading order with its panel. */
  focusStops: FocusStop[]
  /** Every button on the screen, for presses by id. */
  buttons: ScreenButton[]
}

export function selectUpgradeBayModel(
  state: AuthorityState,
  playerId: string,
  ui: BayUiState,
): UpgradeBayModel {
  const levels = state.players[playerId].vehicle.levels
  const tracks = workshopRowsOf(state, playerId)
  const casing = casingRowOf(state, playerId)
  const repair = repairReadingOf(state, playerId)
  const footer = bayFooterOf(state, playerId, ui)
  const focusStops = upgradeBayFocusStops(tracks, casing, repair, footer)
  const quickService = wrongBayQuickServiceOf(state, playerId)
  return {
    header: bayHeaderOf(state, playerId, 'upgrade'),
    tracks,
    casing,
    repair,
    visualTier: visualTier(levels),
    preview: previewOf(levels, tracks, focusOnScreen(focusStops, ui.focusedId, focusStops[0].id)),
    quickService,
    footer,
    focusStops,
    buttons: [...focusedButtonsOf(tracks, casing, repair, footer), quickService],
  }
}

/** The Upgrade bay opens on its first track's Buy. */
export function upgradeBayStartFocus(model: UpgradeBayModel): string {
  return model.focusStops[0].id
}

function casingRowOf(state: AuthorityState, playerId: string): CasingRow {
  const grade = state.players[playerId].vehicle.casingGrade
  const buy = commandButton(
    state,
    playerId,
    UI_IDS.upgradebayCasingBuy,
    'Buy',
    buyCasingGradeCommand(),
  )
  return {
    iconId: 'icon-casing',
    label: 'Casing',
    grade,
    gradeAfter: grade + 1,
    gradeText: `${grade} → ${grade + 1}`,
    cost: amountReading(nextCasingPrice(state, playerId)),
    buy,
    buyState: buyStateOf(buy),
  }
}

function repairReadingOf(state: AuthorityState, playerId: string): RepairReading {
  const vehicle = state.players[playerId].vehicle
  return {
    hullText: hullGaugeText(vehicle.hull, statsOfVehicle(vehicle).hullMax),
    button: commandButton(state, playerId, UI_IDS.workshopRepair, 'Repair', repairHullCommand()),
    cost: amountReading(repairCostOf(state, playerId)),
  }
}

function wrongBayQuickServiceOf(state: AuthorityState, playerId: string): ScreenButton {
  return commandButton(
    state,
    playerId,
    UI_IDS.upgradebayQuickService,
    'Sell, repair and recharge: at the Sell bay',
    quickServiceCommand(),
  )
}

function previewOf(
  levels: UpgradeLevels,
  tracks: readonly WorkshopRow[],
  focusedId: string,
): UpgradePreview {
  const focused = tracks.find((row) => row.buy.id === focusedId)
  if (focused === undefined) return { highlight: null, visualTier: visualTier(levels) }
  const after = { ...levels, [focused.upgradeId]: levels[focused.upgradeId] + 1 }
  return { highlight: focused.upgradeId, visualTier: visualTier(after) }
}

function focusedButtonsOf(
  tracks: readonly WorkshopRow[],
  casing: CasingRow,
  repair: RepairReading,
  footer: BayFooter,
): ScreenButton[] {
  return [...tracks.map((row) => row.buy), casing.buy, repair.button, ...footerButtonsOf(footer)]
}

function upgradeBayFocusStops(
  tracks: readonly WorkshopRow[],
  casing: CasingRow,
  repair: RepairReading,
  footer: BayFooter,
): FocusStop[] {
  return [
    ...tracks.map((row) => row.buy).map(stopIn('tracks')),
    stopIn('casing')(casing.buy),
    stopIn('repair')(repair.button),
    ...footerButtonsOf(footer).map(stopIn('footer')),
  ]
}
