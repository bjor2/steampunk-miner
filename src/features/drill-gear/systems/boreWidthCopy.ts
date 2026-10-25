/**
 * The width cards' copy (GD lock on #308, ticket 621): the side cutters, their width Mark 2 and
 * Wide's reamers on top of the widest Mark each read their bore's width. Width is yield and
 * clearing, never speed, so the cards show the ore a metre it adds and say the drill is no faster.
 * The drill types (Wide, Deep, the twin bit, the reach boom) read as one-off sidegrades: the drill's
 * own cut formula, no level track (the VS on #308).
 *
 * The width is the real bore's, from data (ticket 663, re-baselining #621 on the 1.2 m bore): the
 * stamp's diameter (the body plus the bore row's clearance a side, `drillBore.ts`) plus `s` side
 * cells of a metre on each flank (`drillGearCells.ts`), so 1.2 m bare, 3.2 m with one side cell.
 * The ore a metre follows the #316 width bench: a level metre opens b + s cells (b the bare bore's
 * `BARE_BORE_CELLS_PER_METRE`), each side cell paying the kernel's `sideOreShareBp` of its ore, so
 * the ore a metre grows by `s * share / b`.
 */
import { BARE_BORE_CELLS_PER_METRE } from '../../../constants/balance'
import { MM_PER_METRE } from '../../../constants/physics'
import { formatAmount } from '../../../systems/displayAmount'
import { ECONOMY } from '../../../systems/economy/economy'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import { drillStampRadiusMm } from '../../../systems/vehicle/drillBore'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'

const PERCENT_OF_BASIS_POINTS = 100

export const WIDER_NOT_FASTER_NOTE =
  'a wider bore, not a faster one: each side cell costs its full energy and heat'
export const SIDEGRADE_NOTE = 'a one-off sidegrade: no level track, and drill speed is unchanged'

/** The bore's width in metres with `sideCells` side cells on each flank. */
export function boreWidthMOf(sideCells: number): Money {
  const widthMm = 2 * (drillStampRadiusMm() + sideCells * MM_PER_METRE)
  return div(fromSafeInteger(widthMm), fromSafeInteger(MM_PER_METRE))
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
    fixedLineSpecOf('Bore width (m)', boreWidthMOf(sideCells)),
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
  const reamed = formatAmount(boreWidthMOf(reamerCells))
  const widest = formatAmount(boreWidthMOf(widestCells))
  return `bore width ${reamed} m, ${widest} m with the widest flank cutters on`
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
