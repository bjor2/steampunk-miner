/**
 * `selectUpgradeBayModel` (#37 Upgrade bay screen, #58): the six vehicle tracks in #7's order,
 * each with its icon, level, next cost, effect "before -> after" and Buy; then the Casing row
 * (#41, Game Director's scope review on #54), which is not a vehicle track: its grade "G -> G+1",
 * next cost and Buy; then the Lining row once a lining type is offered (#113); then the Guns row
 * once `auto_guns` is offered (#107); then the Charges and Rack rows once `blasting_charges` is
 * (#109); then one row per vehicle item the tech tree unlocked and a slice sells (ticket 248);
 * then the slices' bay entries once their anchor row is open (ticket 344); then Repair with its
 * cost; and the live preview hook, under the shared header and footer. Bay entries never feed the
 * preview.
 *
 * The preview is presentation only (#37, `upgradePreview`): focus and the install animation are UI
 * state, so moving focus never touches the authority or the digest.
 *
 * The quick action is the Sell bay's (#170): the Outfitter (ticket 687) draws no button for it.
 */
import { buttonIconIdOf, CASING_ICON_ID, PREVIEW_TIER_ICON_ID } from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import { nextCasingPrice } from '../authority/casingRules'
import { repairCostOf } from '../authority/platformServices'
import { visualTier } from '../economy/vehicleStats'
import { buyCasingGradeCommand, repairHullCommand } from '../platform/platformCommands'
import { CLICK_CHAIN } from '../authority/purchaseChain'
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
import { bayEntryButtonsOf, bayEntryRowsOf, type BayEntryRow } from './bayEntryRows'
import { chargeButtonsOf, chargeRowsOf, type ChargeRows } from './chargeRows'
import { gunRowOf, type GunRow } from './gunRow'
import { liningRowOf, type LiningRow } from './liningRow'
import { vehicleItemRowsOf, type VehicleItemRow } from './vehicleItemRows'
import { KERNEL_ITEMS } from '../registries/kernelItems'
import { itemCardOf, serviceCardOf, SHOP_SOURCE, type ItemCardModel } from './itemCardModel'
import { focusOnScreen, type FocusStop } from './menuFocus'
import { UI_IDS } from './screenIds'
import { upgradePreviewOf, type UpgradePreview } from './upgradePreview'
import {
  priceReading,
  commandButton,
  withIcon,
  type AmountReading,
  type ScreenButton,
} from './viewParts'
import {
  buyStateOf,
  isBuyOpen,
  workshopRowsOf,
  type BuyState,
  type RowBadge,
  type WorkshopRow,
} from './workshopRows'

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
  badge: RowBadge
  isBuyOpen: boolean
  /** The kernel item card this row draws as, compact (K7 #199). */
  card: ItemCardModel
}

export interface RepairReading {
  hullText: string
  button: ScreenButton
  cost: AmountReading
  /** The service's card, a tooltip over Repair (K7 #199). */
  card: ItemCardModel
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
  /** The researched vehicle items on sale here, none before research (ticket 248). */
  items: VehicleItemRow[]
  /** The slices' bay entries, none before their anchor row opens (ticket 344). */
  entries: BayEntryRow[]
  repair: RepairReading
  visualTier: number
  /** The preview's tier gauge glyph (#158). */
  tierIconId: string
  preview: UpgradePreview
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
  const items = vehicleItemRowsOf(state, playerId)
  const entries = bayEntryRowsOf(state, playerId)
  const repair = repairReadingOf(state, playerId)
  const footer = bayFooterOf(state, playerId, ui)
  const rows: ShopRows = { tracks, casing, lining, guns, charges, items, entries, repair }
  const focusStops = upgradeBayFocusStops(rows, footer)
  return {
    header: bayHeaderOf(state, playerId, 'upgrade'),
    tracks,
    casing,
    lining,
    guns,
    charges,
    items,
    entries,
    repair,
    visualTier: visualTier(levels),
    tierIconId: PREVIEW_TIER_ICON_ID,
    preview: upgradePreviewOf(levels, {
      focusedId: focusOnScreen(focusStops, ui.focusedId, focusStops[0].id),
      tracks,
      casingBuyId: casing.buy.id,
      casingGradeAfter: casing.gradeAfter,
      installing: ui.installingUpgradeId,
    }),
    footer,
    focusStops,
    buttons: focusedButtonsOf(rows, footer),
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
    buyCasingGradeCommand(CLICK_CHAIN),
  )
  const cost = priceReading(nextCasingPrice(state, playerId))
  return {
    iconId: CASING_ICON_ID,
    label: 'Casing',
    grade,
    gradeAfter: grade + 1,
    gradeText: `${grade} → ${grade + 1}`,
    cost,
    buy,
    buyState: buyStateOf(buy),
    badge: null,
    isBuyOpen: isBuyOpen(buy),
    card: itemCardOf(state, playerId, {
      item: KERNEL_ITEMS.casing,
      iconId: CASING_ICON_ID,
      name: 'Casing',
      cost,
      level: grade,
      buy,
      source: SHOP_SOURCE,
    }),
  }
}

function repairReadingOf(state: AuthorityState, playerId: string): RepairReading {
  const vehicle = state.players[playerId].vehicle
  const iconId = buttonIconIdOf('repair')
  const button = withIcon(
    commandButton(state, playerId, UI_IDS.workshopRepair, 'Repair', repairHullCommand()),
    iconId,
  )
  const cost = priceReading(repairCostOf(state, playerId))
  const service = { item: KERNEL_ITEMS.repair, name: 'Repair', iconId, button, cost }
  return {
    hullText: hullGaugeText(vehicle.hull, statsOfVehicle(vehicle).hullMax),
    button,
    cost,
    card: serviceCardOf(state, playerId, service),
  }
}

/** The bay's rows of things to buy, in reading order. */
interface ShopRows {
  tracks: readonly WorkshopRow[]
  casing: CasingRow
  lining: LiningRow | null
  guns: GunRow | null
  charges: ChargeRows | null
  items: readonly VehicleItemRow[]
  entries: readonly BayEntryRow[]
  repair: RepairReading
}

function focusedButtonsOf(rows: ShopRows, footer: BayFooter): ScreenButton[] {
  return [
    ...rows.tracks.map((row) => row.buy),
    rows.casing.buy,
    ...liningButtonsOf(rows.lining),
    ...gunButtonsOf(rows.guns),
    ...chargeButtonsOf(rows.charges),
    ...rows.items.map((row) => row.buy),
    ...bayEntryButtonsOf(rows.entries),
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
    ...rows.items.map((row) => row.buy).map(stopIn('items')),
    ...bayEntryButtonsOf(rows.entries).map(stopIn('entries')),
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
