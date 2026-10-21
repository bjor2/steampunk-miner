/**
 * The Hold (#33 section 6, #8; spec #678, ticket 688): the base sheet's cargo tab, one card per
 * held ore tier with its amount, unit value and line value, then Sell all with the hold's units
 * against capacity and its exact value, all at the shop's `floorMilli(V(t))` prices, or the
 * mid-band price on a tier `assay_beacon` lifts (#46). Core fragments are banked on docking and
 * never sold (#10). The tab shows everywhere; its Sell cards act only while docked at the Sell bay,
 * because each carries the authority's refusal of its sale and is greyed while there is one.
 *
 * The hold counts ore by tier only (#7: value comes from the tier at sell time), so a card cannot
 * know which family its units came from; it says `mixed` and shows the tier number, never colour.
 */
import { oreIconIdOf } from '../art/icons/oreIcon'
import { buttonIconIdOf } from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import { isAssayLiftedFor, sellBayUnitPrice, serviceQuote } from '../authority/platformServices'
import { fromSafeInteger, mul } from '../money'
import { sellCargoCommand } from '../platform/platformCommands'
import { cargoGaugeText } from '../vehicle/vehicleReadout'
import { cargoUnitsOf, statsOfVehicle } from '../vehicle/vehicleState'
import type { FocusStop } from './menuFocus'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import {
  amountReading,
  commandButton,
  withIcon,
  type AmountReading,
  type ScreenButton,
} from './viewParts'

/** The assay glyph on a lifted price (#46). */
const ASSAY_MARK = '◈'

/** One held tier's card: its title and line, the line value beside the title, and its Sell. */
export interface HoldTierCard {
  tier: number
  /** `metal`, `crystal` or `mixed`; the hold keeps no family, so a tier card is `mixed`. */
  family: 'mixed'
  /** The tier's generated ore icon (#158): a hex at the tier's luma with its grade. */
  iconId: string
  title: string
  line: string
  amount: number
  unitValue: AmountReading
  /** `assay_beacon` priced this tier at the mid-band unit value (#46: shown with an assay glyph). */
  isAssayed: boolean
  lineValue: AmountReading
  sell: ScreenButton
}

/** Sell all: the hold's units against capacity and what the whole hold pays now. */
export interface HoldSellAllCard {
  title: string
  line: string
  cargoTotalText: string
  value: AmountReading
  sell: ScreenButton
}

export interface HoldSheet {
  tiers: HoldTierCard[]
  sellAll: HoldSellAllCard
  /** Every Sell in reading order, for the pad and the keys on the sheet. */
  focusStops: FocusStop[]
  /** Every Sell on the tab, for presses by id. */
  buttons: ScreenButton[]
}

const HOLD_PANEL = 'hold'

export function holdSheetOf(state: AuthorityState, playerId: string): HoldSheet {
  const tiers = heldTiers(state.players[playerId].vehicle.cargo.ore).map(([tier, amount]) =>
    holdTierCardOf(state, playerId, tier, amount),
  )
  const sellAll = sellAllCardOf(state, playerId)
  const buttons = [...tiers.map((card) => card.sell), sellAll.sell]
  return {
    tiers,
    sellAll,
    focusStops: buttons.map((button) => ({ id: button.id, panel: HOLD_PANEL })),
    buttons,
  }
}

/** What the Sell bay's Hold row says of the hold: units against capacity and its sale value. */
export function holdTotalsOf(
  state: AuthorityState,
  playerId: string,
): { cargoTotalText: string; value: AmountReading } {
  const vehicle = state.players[playerId].vehicle
  return {
    cargoTotalText: cargoGaugeText(
      cargoUnitsOf(vehicle.cargo),
      statsOfVehicle(vehicle).cargoCapacity,
    ),
    value: amountReading(serviceQuote(state, playerId).saleValue),
  }
}

function heldTiers(ore: Readonly<Record<string, number>>): [number, number][] {
  return Object.entries(ore)
    .map(([tier, amount]): [number, number] => [Number.parseInt(tier, 10), amount])
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a - b)
}

function holdTierCardOf(
  state: AuthorityState,
  playerId: string,
  tier: number,
  amount: number,
): HoldTierCard {
  const unit = sellBayUnitPrice(state, playerId, tier)
  const unitValue = amountReading(unit)
  const isAssayed = isAssayLiftedFor(state, playerId, tier)
  return {
    tier,
    family: 'mixed',
    iconId: oreIconIdOf('mixed', tier),
    title: `Tier ${tier} ore`,
    line: tierLineOf(amount, unitValue.text, isAssayed),
    amount,
    unitValue,
    isAssayed,
    lineValue: amountReading(mul(unit, fromSafeInteger(amount))),
    sell: commandButton(
      state,
      playerId,
      UI_ID_TEMPLATES.holdSell(tier),
      'Sell',
      sellCargoCommand(tier),
    ),
  }
}

/** "12 held, 4.5k each." in the ledger voice; an assayed price carries the glyph and says so. */
function tierLineOf(amount: number, unitText: string, isAssayed: boolean): string {
  if (isAssayed) return `${amount} held, ${ASSAY_MARK} ${unitText} each at the assay price.`
  return `${amount} held, ${unitText} each.`
}

function sellAllCardOf(state: AuthorityState, playerId: string): HoldSellAllCard {
  const totals = holdTotalsOf(state, playerId)
  return {
    title: 'Sell all',
    line: `${totals.cargoTotalText} units, the whole hold at once.`,
    cargoTotalText: totals.cargoTotalText,
    value: totals.value,
    sell: withIcon(
      commandButton(state, playerId, UI_IDS.holdSellAll, 'Sell all', sellCargoCommand('all')),
      buttonIconIdOf('sell'),
    ),
  }
}
