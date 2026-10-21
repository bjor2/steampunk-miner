/**
 * The save slot line's summary (ticket 703; GD lock on #703): the planet's name (ticket 702), the
 * deepest depth written exactly as the HUD strip writes depth (`depthStripTextOf`, ticket 684)
 * with a thin surface-to-core gauge beside it, and the money through the compact formatter,
 * rounded down as a balance is (ticket 681, at most 6 characters). The drill level the header also
 * holds is never shown. Read only from the slot entry: a slot whose header holds no summary names
 * its planet from the entry's index and shows its depth and money as unknown.
 */
import { SAVE_MENU_TEXT } from './saveMenuText'
import { exactAmount, formatAmount } from '../displayAmount'
import { fromCanonical } from '../money'
import { planetDisplayNameOf } from '../registries/planetNames'
import type { SaveSlotEntry } from '../save/saveSlotIndex'
import type { SaveSlotSummary } from '../save/saveSlotSummary'
import { depthStripTextOf, edgePermilleOf } from './hudStrip'

/** A value on the slot line: its short text and the exact one behind it. */
export interface SlotReading {
  text: string
  exact: string
}

export interface SlotDepthReading extends SlotReading {
  /** How far the deepest dig went from the surface toward the core, 0..1000; null when unknown. */
  gaugePermille: number | null
}

export interface SlotSummaryLine {
  planetText: string
  depth: SlotDepthReading
  money: SlotReading
}

/** The text a slot shows for a summary its header does not hold. */
export const UNKNOWN_SUMMARY_TEXT = SAVE_MENU_TEXT.slotLine.unknown

const UNKNOWN_READING: SlotReading = { text: UNKNOWN_SUMMARY_TEXT, exact: '' }

export function slotSummaryLineOf(entry: SaveSlotEntry): SlotSummaryLine {
  const { summary } = entry
  if (summary === undefined) return unknownSummaryLineOf(entry.planetIndex)
  return {
    planetText: summary.planetName,
    depth: depthReadingOf(summary),
    money: moneyReadingOf(summary.money),
  }
}

function unknownSummaryLineOf(planetIndex: number): SlotSummaryLine {
  return {
    planetText: planetDisplayNameOf(planetIndex),
    depth: { ...UNKNOWN_READING, gaugePermille: null },
    money: UNKNOWN_READING,
  }
}

function depthReadingOf(summary: SaveSlotSummary): SlotDepthReading {
  const { deepestMetres, coreDepthMetres } = summary
  const toCore = Math.max(0, coreDepthMetres - deepestMetres)
  return {
    text: depthStripTextOf(deepestMetres),
    exact: String(deepestMetres),
    gaugePermille: edgePermilleOf(deepestMetres, toCore),
  }
}

function moneyReadingOf(canonical: string): SlotReading {
  const money = fromCanonical(canonical)
  return { text: formatAmount(money), exact: exactAmount(money) }
}
