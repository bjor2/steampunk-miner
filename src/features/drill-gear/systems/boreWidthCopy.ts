/**
 * The width cards' copy (GD lock on #308, ticket 621): the side cutters read "Bore width 3 m",
 * their width Mark 2 "4 m", and Wide's reamers "5 m" on top of the widest Mark. Width is yield
 * and clearing, never speed, so the cards show the ore a metre it adds and say the drill is no
 * faster. The drill types (Wide, Deep, the twin bit, the reach boom) read as one-off sidegrades:
 * the drill's own cut formula, no level track (the VS on #308).
 *
 * The bore is `2 + s` cells a metre with `s` side cells (the #316 width bench, ticket 620's
 * `sideCellsPerMetre` spec); a cell is a metre, so that is its width in metres. Each side cell
 * pays the kernel's `sideOreShareBp` of its ore, so the ore a metre grows by `s * share / 2`.
 */
import { formatAmount } from '../../../systems/displayAmount'
import { ECONOMY } from '../../../systems/economy/economy'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'

/** The bare bore's cells a metre: the bit's own stamp, before any side cell (#316). */
export const BARE_BORE_CELLS_PER_METRE = 2

const PERCENT_OF_BASIS_POINTS = 100

export const WIDER_NOT_FASTER_NOTE =
  'a wider bore, not a faster one: each side cell costs its full energy and heat'
export const SIDEGRADE_NOTE = 'a one-off sidegrade: no level track, and drill speed is unchanged'

/** The bore's width in metres with `sideCells` side cells. */
export function boreWidthMOf(sideCells: number): number {
  return BARE_BORE_CELLS_PER_METRE + sideCells
}

/** The side cells' ore share as a percent of a whole cell's ore. */
export function sideOreSharePercent(): Money {
  return percentOf(ECONOMY.drillGearCaps.sideOreShareBp)
}

/** How much more ore a metre the bore takes with `sideCells` side cells, as a percent. */
export function oreGainPercentOf(sideCells: number): Money {
  const gainBp = sideCells * ECONOMY.drillGearCaps.sideOreShareBp
  return div(percentOf(gainBp), fromSafeInteger(BARE_BORE_CELLS_PER_METRE))
}

/** A width part's card lines at `sideCells`: its bore width, its ore gain and the speed note. */
export function widthLineSpecsOf(sideCells: number): DescribedStatLineSpec[] {
  return [
    fixedLineSpecOf('Bore width (m)', fromSafeInteger(boreWidthMOf(sideCells))),
    fixedLineSpecOf('Ore a metre (+%)', oreGainPercentOf(sideCells)),
    noteLineSpecOf(WIDER_NOT_FASTER_NOTE),
  ]
}

/**
 * Wide's card notes: its bore with the reamers alone and with the widest width Mark's cutters
 * switched on beside them, the ore that widest bore adds, and the sidegrade line. The #255 guard
 * keeps the cutters' name off the card, so they read as flank cutters.
 */
export function wideBranchNotesOf(reamerCells: number, widestCutterCells: number): string[] {
  const widest = reamerCells + widestCutterCells
  return [wideWidthNoteOf(reamerCells, widest), wideOreNoteOf(widest), SIDEGRADE_NOTE]
}

function wideWidthNoteOf(reamerCells: number, widestCells: number): string {
  const bare = boreWidthMOf(reamerCells)
  return `bore width ${bare} m, ${boreWidthMOf(widestCells)} m with the widest flank cutters on`
}

function wideOreNoteOf(widestCells: number): string {
  const share = formatAmount(sideOreSharePercent())
  return `side cells pay ${share}% of their ore: up to +${formatAmount(oreGainPercentOf(widestCells))}% ore a metre`
}

/** A line of words labelled "Note", the same at every Mark (#351: no comma before the colon). */
export function noteLineSpecOf(note: string): DescribedStatLineSpec {
  return {
    label: 'Note',
    kind: 'linearInt',
    value: () => 0,
    textOf: () => note,
    nextLevel: hasNoNextLevel,
  }
}

function fixedLineSpecOf(label: string, value: Money): DescribedStatLineSpec {
  return { label, kind: 'linearInt', value: () => value, nextLevel: hasNoNextLevel }
}

function percentOf(basisPoints: number): Money {
  return div(fromSafeInteger(basisPoints), fromSafeInteger(PERCENT_OF_BASIS_POINTS))
}
