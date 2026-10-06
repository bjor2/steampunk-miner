/**
 * `selectRefineryBayModel` (#105 design flow): the Refinery bay lists the hold's ore by tier, each
 * row with the batch it would queue (up to half the hold), what that batch pays refined against
 * raw, and Queue; the platform's slots, each empty, refining with the seconds left, or ready; and
 * the next slot with its price. A batch is paid only at the Sell bay, so this screen sells nothing,
 * and with every slot busy each Queue says `slots_busy` while selling raw stays open there.
 * Core fragments never show here: they are banked on docking. A pure function of the replica.
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
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
import type { FocusStop } from './menuFocus'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'

export interface RefineryOreRow {
  tier: number
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
  const buySlot = commandButton(
    state,
    playerId,
    UI_IDS.refinerybaySlotBuy,
    'Buy slot',
    buyRefinerySlotCommand(),
  )
  const footer = bayFooterOf(state, playerId, ui)
  const price = nextRefinerySlotPrice(state)
  return {
    header: bayHeaderOf(state, playerId, 'refinery'),
    ore,
    batchCapText: `${batchCapOf(state, playerId)} units a batch`,
    slots: state.platform.refinerySlots.map((slot, index) =>
      slotReadingOf(slot, index, playerId, state.tick),
    ),
    buySlot,
    slotPrice: price === null ? null : amountReading(price),
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
    held,
    batchUnits,
    raw: amountReading(rawRefineValue(tier, batchUnits)),
    refined: amountReading(refinedValue(tier, batchUnits)),
    queue: commandButton(
      state,
      playerId,
      UI_ID_TEMPLATES.refinerybayQueue(tier),
      `Refine ${batchUnits}`,
      queueRefineCommand(tier, batchUnits),
    ),
  }
}

function slotReadingOf(
  slot: RefinerySlot,
  index: number,
  playerId: string,
  tick: number,
): RefinerySlotReading {
  if (slot === null) return { index, look: 'empty', isYours: false, text: 'Empty' }
  const isYours = slot.owner === playerId
  if (isBatchReady(slot, tick)) {
    return {
      index,
      look: 'ready',
      isYours,
      text: `T${slot.tier} x${slot.units} ready at the Sell bay`,
    }
  }
  const secondsLeft = Math.ceil((slot.readyAtTick - tick) / TICKS_PER_SECOND)
  return {
    index,
    look: 'refining',
    isYours,
    text: `T${slot.tier} x${slot.units}, ${secondsLeft} s`,
  }
}
