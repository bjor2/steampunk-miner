/**
 * `selectUpgradeBayModel` (#37 Upgrade bay screen, #58): the six vehicle tracks in #7's order,
 * each with its icon, level, next cost, effect "before -> after" and Buy; then the Casing row
 * (#41, Game Director's scope review on #54), which is not a vehicle track: its grade "G -> G+1",
 * next cost and Buy; then the Lining row once a lining type is offered (#113); then the Guns row
 * once `auto_guns` is offered (#107); then the Charges and Rack rows once `blasting_charges` is
 * (#109); then Repair with its
 * cost; and the live preview hook, under the shared header and footer.
 *
 * The preview is presentation only (#37, `upgradePreview`): focus and the install animation are UI
 * state, so moving focus never touches the authority or the digest.
 *
 * The quick action belongs to the Sell bay; here it is a disabled sign carrying `wrong_bay`
 * (#40), never a focus stop.
 */
import { CASING_ICON_ID } from '../art/artIds'
import type { AuthorityState } from '../authority/authorityState'
import { nextCasingPrice } from '../authority/casingRules'
import { repairCostOf } from '../authority/platformServices'
import { visualTier } from '../economy/vehicleStats'
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
import { chargeButtonsOf, chargeRowsOf, type ChargeRows } from './chargeRows'
import { gunRowOf, type GunRow } from './gunRow'
import { liningRowOf, type LiningRow } from './liningRow'
import { focusOnScreen, type FocusStop } from './menuFocus'
import { UI_IDS } from './screenIds'
import { upgradePreviewOf, type UpgradePreview } from './upgradePreview'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, workshopRowsOf, type BuyState, type WorkshopRow } from './workshopRows'

export interface CasingRow {
  /** The seventh vector icon (#54 scope review). */
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

export interface UpgradeBayModel {
  header: BayHeader
  tracks: WorkshopRow[]
  casing: CasingRow
  /** Null until a lining type is offered here or owned (#113; #90: nothing shows before). */
  lining: LiningRow | null
  /** Null until `auto_guns` is unlocked here or bolted on (#90: nothing shows before). */
  guns: GunRow | null
  /** Null until `blasting_charges` is open here or the rack is bolted on (#109). */
  charges: ChargeRows | null
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
  const lining = liningRowOf(state, playerId)
  const guns = gunRowOf(state, playerId)
  const charges = chargeRowsOf(state, playerId)
  const repair = repairReadingOf(state, playerId)
  const footer = bayFooterOf(state, playerId, ui)
  const rows: ShopRows = { tracks, casing, lining, guns, charges, repair }
  const focusStops = upgradeBayFocusStops(rows, footer)
  const quickService = wrongBayQuickServiceOf(state, playerId)
  return {
    header: bayHeaderOf(state, playerId, 'upgrade'),
    tracks,
    casing,
    lining,
    guns,
    charges,
    repair,
    visualTier: visualTier(levels),
    preview: upgradePreviewOf(levels, {
      focusedId: focusOnScreen(focusStops, ui.focusedId, focusStops[0].id),
      tracks,
      casingBuyId: casing.buy.id,
      casingGradeAfter: casing.gradeAfter,
      installing: ui.installingUpgradeId,
    }),
    quickService,
    footer,
    focusStops,
    buttons: [...focusedButtonsOf(rows, footer), quickService],
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
    iconId: CASING_ICON_ID,
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

/** The bay's rows of things to buy, in reading order. */
interface ShopRows {
  tracks: readonly WorkshopRow[]
  casing: CasingRow
  lining: LiningRow | null
  guns: GunRow | null
  charges: ChargeRows | null
  repair: RepairReading
}

function focusedButtonsOf(rows: ShopRows, footer: BayFooter): ScreenButton[] {
  return [
    ...rows.tracks.map((row) => row.buy),
    rows.casing.buy,
    ...liningButtonsOf(rows.lining),
    ...gunButtonsOf(rows.guns),
    ...chargeButtonsOf(rows.charges),
    rows.repair.button,
    ...footerButtonsOf(footer),
  ]
}

function upgradeBayFocusStops(rows: ShopRows, footer: BayFooter): FocusStop[] {
  return [
    ...rows.tracks.map((row) => row.buy).map(stopIn('tracks')),
    stopIn('casing')(rows.casing.buy),
    ...liningButtonsOf(rows.lining).map(stopIn('lining')),
    ...gunButtonsOf(rows.guns).map(stopIn('guns')),
    ...chargeButtonsOf(rows.charges).map(stopIn('charges')),
    stopIn('repair')(rows.repair.button),
    ...footerButtonsOf(footer).map(stopIn('footer')),
  ]
}

function gunButtonsOf(guns: GunRow | null): ScreenButton[] {
  return guns === null ? [] : [guns.buy]
}

function liningButtonsOf(lining: LiningRow | null): ScreenButton[] {
  return lining === null ? [] : [lining.button]
}
