/**
 * `selectRefineryBayModel` (#105 design flow): the Refinery bay lists the hold's ore by tier, each
 * row with the batch it would queue (up to half the hold), what that batch pays refined against
 * raw, and Queue; the platform's slots, each empty, refining with the seconds left, or ready; and
 * the next slot with its price. A batch is paid only at the Sell bay, so this screen sells nothing,
 * and with every slot busy each Queue says `slots_busy` while selling raw stays open there.
 * Core fragments never show here: they are banked on docking. A pure function of the replica.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { buttonIconIdOf, REFINERY_SLOT_ICON_ID } from '../art/icons/iconSet'
import { oreIconIdOf } from '../art/icons/oreIcon'
import type { AuthorityState } from '../authority/authorityState'
import { isBatchReady, type RefinerySlot } from '../authority/refinery/refineryBatch'
import { batchCapOf, nextRefinerySlotPrice } from '../authority/refinery/refineryRules'
import { rawRefineValue, refinedValue } from '../economy/refineryEconomy'
import { buyRefinerySlotCommand, queueRefineCommand } from '../platform/platformCommands'
import {
  bayFooterOf,
  bayHeaderOf,
  footerButtonsOf,
  stopIn,
  type BayFooter,
  type BayHeader,
  type BayUiState,
} from './bayFrame'
import { KERNEL_ITEMS } from '../registries/kernelItems'
import { itemCardOf, SHOP_SOURCE, type ItemCardModel } from './itemCardModel'
import type { FocusStop } from './menuFocus'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import {
  amountReading,
  commandButton,
  withIcon,
  type AmountReading,
  type ScreenButton,
} from './viewParts'

export interface RefineryOreRow {
  tier: number
  iconId: string
  held: number
  /** What Queue moves into a slot: the held units, at most half the hold. */
  batchUnits: number
  raw: AmountReading
  refined: AmountReading
  queue: ScreenButton
}

/** The look each slot shows, and the bay's own art (#106 idle, refining, ready). */
export type RefinerySlotLook = 'empty' | 'refining' | 'ready'

export interface RefinerySlotReading {
  index: number
  iconId: string
  look: RefinerySlotLook
  /** The batch is this player's: only they collect it, at the Sell bay. */
  isYours: boolean
  text: string
}

export interface RefineryBayModel {
  header: BayHeader
  ore: RefineryOreRow[]
  batchCapText: string
  slots: RefinerySlotReading[]
  buySlot: ScreenButton
  /** Null once the refinery has every slot it can have. */
  slotPrice: AmountReading | null
  /** The next slot's card, drawn full on the platform (K7 #199). */
  slotCard: ItemCardModel
  footer: BayFooter
  focusStops: FocusStop[]
  buttons: ScreenButton[]
}

export function selectRefineryBayModel(
  state: AuthorityState,
  playerId: string,
  ui: BayUiState,
): RefineryBayModel {
  const ore = oreRowsOf(state, playerId)
  const buySlot = withIcon(
    commandButton(state, playerId, UI_IDS.refinerybaySlotBuy, 'Buy slot', buyRefinerySlotCommand()),
    REFINERY_SLOT_ICON_ID,
  )
  const footer = bayFooterOf(state, playerId, ui)
  const price = nextRefinerySlotPrice(state)
  const slotPrice = price === null ? null : amountReading(price)
  return {
    header: bayHeaderOf(state, playerId, 'refinery'),
    ore,
    batchCapText: `${batchCapOf(state, playerId)} units a batch`,
    slots: state.platform.refinerySlots.map((slot, index) =>
      slotReadingOf(slot, index, playerId, state.tick),
    ),
    buySlot,
    slotPrice,
    slotCard: itemCardOf(state, playerId, {
      item: KERNEL_ITEMS.refinerySlot,
      iconId: REFINERY_SLOT_ICON_ID,
      name: 'Refinery slot',
      cost: slotPrice,
      level: state.platform.refinerySlots.length,
      buy: buySlot,
      source: SHOP_SOURCE,
    }),
    footer,
    focusStops: [
      ...ore.map((row) => stopIn('ore')(row.queue)),
      stopIn('slots')(buySlot),
      ...footerButtonsOf(footer).map(stopIn('footer')),
    ],
    buttons: [...ore.map((row) => row.queue), buySlot, ...footerButtonsOf(footer)],
  }
}

/** The first Queue when the hold has ore, else Buy slot. */
export function refineryBayStartFocus(model: RefineryBayModel): string {
  return model.ore[0]?.queue.id ?? model.buySlot.id
}

/** Highest tier first: the most valuable batch is the one worth refining. */
function oreRowsOf(state: AuthorityState, playerId: string): RefineryOreRow[] {
  const cap = batchCapOf(state, playerId)
  return Object.entries(state.players[playerId].vehicle.cargo.ore)
    .map(([tier, held]) => ({ tier: Number.parseInt(tier, 10), held }))
    .filter((entry) => entry.held > 0)
    .sort((a, b) => b.tier - a.tier)
    .map((entry) => oreRowOf(state, playerId, entry.tier, entry.held, Math.min(entry.held, cap)))
}

function oreRowOf(
  state: AuthorityState,
  playerId: string,
  tier: number,
  held: number,
  batchUnits: number,
): RefineryOreRow {
  return {
    tier,
    iconId: oreIconIdOf('mixed', tier),
    held,
    batchUnits,
    raw: amountReading(rawRefineValue(tier, batchUnits)),
    refined: amountReading(refinedValue(tier, batchUnits)),
    queue: withIcon(
      commandButton(
        state,
        playerId,
        UI_ID_TEMPLATES.refinerybayQueue(tier),
        `Refine ${batchUnits}`,
        queueRefineCommand(tier, batchUnits),
      ),
      buttonIconIdOf('refine'),
    ),
  }
}

function slotReadingOf(
  slot: RefinerySlot,
  index: number,
  playerId: string,
  tick: number,
): RefinerySlotReading {
  const iconId = REFINERY_SLOT_ICON_ID
  if (slot === null) return { index, iconId, look: 'empty', isYours: false, text: 'Empty' }
  const isYours = slot.owner === playerId
  if (isBatchReady(slot, tick)) {
    return {
      index,
      iconId,
      look: 'ready',
      isYours,
      text: `T${slot.tier} x${slot.units} ready at the Sell bay`,
    }
  }
  const secondsLeft = Math.ceil((slot.readyAtTick - tick) / TICKS_PER_SECOND)
  return {
    index,
    iconId,
    look: 'refining',
    isYours,
    text: `T${slot.tier} x${slot.units}, ${secondsLeft} s`,
  }
}
