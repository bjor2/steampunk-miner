/**
 * The Sell bay's refined lines (#105 flow step 4): each of this player's ready Refinery batches,
 * with what it pays (`floorMilli(units * V * 1.25)`), and Collect for all of them. The Sell bay
 * stays the one place that pays cash; a batch still refining, or another player's, is not listed.
 * Before the platform has the Refinery bay the panel is not there at all (#90: nothing shows).
 */
import type { AuthorityState } from '../authority/authorityState'
import { readySlotsOf, type RefineryBatch } from '../authority/refinery/refineryBatch'
import { readyRefinedValueOf } from '../authority/refinery/refineryCollection'
import { hasRefineryOn } from '../authority/refinery/refineryFacility'
import { refinedValue } from '../economy/refineryEconomy'
import { collectRefinedCommand } from '../platform/platformCommands'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'

export interface RefinedLine {
  slot: number
  tier: number
  units: number
  value: AmountReading
}

export interface RefinedPanel {
  lines: RefinedLine[]
  total: AmountReading
  collect: ScreenButton
}

export function refinedPanelOf(state: AuthorityState, playerId: string): RefinedPanel | null {
  if (!hasRefineryOn(state.planet.index)) return null
  const slots = state.platform.refinerySlots
  return {
    lines: readySlotsOf(slots, playerId, state.tick).map((slot) =>
      refinedLineOf(slot, slots[slot] as RefineryBatch),
    ),
    total: amountReading(readyRefinedValueOf(state, playerId)),
    collect: commandButton(
      state,
      playerId,
      UI_IDS.sellbayRefinedCollect,
      'Collect refined',
      collectRefinedCommand(),
    ),
  }
}

/** The line's id comes from its slot, so a spec finds the batch it queued. */
export function refinedLineId(line: RefinedLine): string {
  return UI_ID_TEMPLATES.sellbayRefinedLine(line.slot)
}

function refinedLineOf(slot: number, batch: RefineryBatch): RefinedLine {
  return {
    slot,
    tier: batch.tier,
    units: batch.units,
    value: amountReading(refinedValue(batch.tier, batch.units)),
  }
}
