/**
 * The Refinery bay's panels on the shared Title+OneLine element (spec #422, pass #427): each held
 * tier with its batch's raw and refined pay, the batch size, each slot with its state as the one
 * line, and the next slot as its kernel item card (Content's mapping on #422) with its price kept
 * on the element. What a bare number means sits in the panel's tooltip, so no text is lost.
 */
import {
  buttonIconIdOf,
  gaugeIconIdOf,
  REFINERY_SLOT_ICON_ID,
} from '../../systems/art/icons/iconSet'
import { itemCardElementOf, type ItemCardElement } from '../../systems/views/itemCardElement'
import type {
  RefineryBayModel,
  RefineryOreRow,
  RefinerySlotReading,
} from '../../systems/views/refineryBayModel'
import type { ElementText, UiTextUnderTitle } from '../../systems/views/uiText'
import { UI_IDS } from '../ids'
import type { IconValue } from '../kit/TitleOneLine'
import { moneyFactOf, priceFactOf, titleOnlyTextOf } from './dockFacts'

/** The next-slot line once the refinery has every slot it can have. */
const ALL_SLOTS_BUILT = 'All slots built'

export const REFINERY_HOLD_HEADING: UiTextUnderTitle = {
  id: 'dock.refinery.hold',
  oneLine: 'Refine a batch per tier; the Sell bay pays it.',
  tooltipLines: ['Each row: units held, raw pay, then refined pay.'],
}

export const REFINERY_SLOTS_HEADING: UiTextUnderTitle = {
  id: 'dock.refinery.slots',
  oneLine: 'Batches refine here, then wait at the Sell bay.',
  tooltipLines: [],
}

export function oreRowTextOf(row: RefineryOreRow): ElementText {
  return titleOnlyTextOf(`dock.refinery.t${row.tier}`, `Tier ${row.tier} ore`)
}

export function oreRowFactsOf(row: RefineryOreRow): IconValue[] {
  return [
    { iconId: row.iconId, text: String(row.held) },
    moneyFactOf(row.raw),
    { ...moneyFactOf(row.refined), iconId: buttonIconIdOf('refine') },
  ]
}

export const BATCH_TEXT: ElementText = titleOnlyTextOf('dock.refinery.batch', 'Batch')

export function batchFactsOf(model: RefineryBayModel): IconValue[] {
  const text = model.batchCapText
  return [{ iconId: gaugeIconIdOf('cargo'), text, testId: UI_IDS.refinerybayBatchCap }]
}

export function slotTextOf(slot: RefinerySlotReading): ElementText {
  const id = `dock.refinery.slot${slot.index}`
  return { id, title: `Slot ${slot.index + 1}`, oneLine: slot.text, tooltipLines: [] }
}

export function slotBuyElementOf(model: RefineryBayModel): ItemCardElement {
  return itemCardElementOf('dock.refinery.slot-buy', model.slotCard)
}

export function slotBuyFactsOf(model: RefineryBayModel): IconValue[] {
  const testId = UI_IDS.refinerybaySlotPrice
  if (model.slotPrice === null)
    return [{ iconId: REFINERY_SLOT_ICON_ID, text: ALL_SLOTS_BUILT, testId }]
  return [priceFactOf(model.slotPrice, testId)]
}
