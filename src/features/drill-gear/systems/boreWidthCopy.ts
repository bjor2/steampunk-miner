/**
 * The width cards' copy (GD lock on #308, ticket 621, on the kernel's one bore width since the GD
 * lock on #662 Part B, ticket 749): a width level grows the body a metre and the bore with it, so
 * the side cutters (Mark 1) read "Bore width 2.2 m", their width Mark 2 "3.2 m", and Wide's reamers
 * "2.2 m" alone and "4.2 m" with the widest Mark owned (`vehicle/drillBore.ts`). Width is yield and
 * clearing, never speed, so the cards show the ore a metre it adds and say the drill is no faster.
 * The drill types (Wide, Deep, the twin bit, the reach boom) read as one-off sidegrades: the
 * drill's own cut formula, no level track (the VS on #308).
 *
 * A level adds one cell a metre past the bare bore's b (`boreCellsPerMetreAt`; b is the #316 width
 * bench's `BARE_BORE_CELLS_PER_METRE`, 1 on the 1.2 m bore since ticket 663), and each such width
 * cell pays the kernel's `sideOreShareBp` of its ore, so the ore a metre grows by `level * share / b`.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { formatAmount } from '../../../systems/displayAmount'
import { ECONOMY } from '../../../systems/economy/economy'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import {
  BARE_WIDTH_LEVEL,
  boreCellsPerMetreAt,
  boreWidthMmAt,
} from '../../../systems/vehicle/drillBore'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'

const PERCENT_OF_BASIS_POINTS = 100

export const WIDER_NOT_FASTER_NOTE =
  'a wider bore, not a faster one: each side cell costs its full energy and heat'
export const SIDEGRADE_NOTE = 'a one-off sidegrade: no level track, and drill speed is unchanged'

/** The bore's width in metres at `widthLevel`: the body and its clearance either side. */
export function boreWidthMOf(widthLevel: number): Money {
  return div(fromSafeInteger(boreWidthMmAt(widthLevel)), fromSafeInteger(MM_PER_METRE))
}

/** The side cells' ore share as a percent of a whole cell's ore. */
export function sideOreSharePercent(): Money {
  return percentOf(ECONOMY.drillGearCaps.sideOreShareBp)
}

/** How much more ore a metre the bore takes at `widthLevel`, as a percent. */
export function oreGainPercentOf(widthLevel: number): Money {
  const gainBp = widthCellsPerMetreOf(widthLevel) * ECONOMY.drillGearCaps.sideOreShareBp
  return div(percentOf(gainBp), fromSafeInteger(boreCellsPerMetreAt(BARE_WIDTH_LEVEL)))
}

/** The width cells a metre of bore opens past the bare bore's at `widthLevel`. */
function widthCellsPerMetreOf(widthLevel: number): number {
  return boreCellsPerMetreAt(widthLevel) - boreCellsPerMetreAt(BARE_WIDTH_LEVEL)
}

/** A width part's card lines at `widthLevel`: its bore width, its ore gain and the speed note. */
export function widthLineSpecsOf(widthLevel: number): DescribedStatLineSpec[] {
  return [
    fixedLineSpecOf('Bore width (m)', boreWidthMOf(widthLevel)),
    fixedLineSpecOf('Ore a metre (+%)', oreGainPercentOf(widthLevel)),
    noteLineSpecOf(WIDER_NOT_FASTER_NOTE),
  ]
}

/**
 * Wide's card notes: its bore at its own width levels and with the widest width Mark owned beside
 * them, the ore that widest bore adds, and the sidegrade line. The #255 guard keeps the cutters'
 * name off the card, so they read as flank cutters.
 */
export function wideBranchNotesOf(wideLevels: number, widestMarkLevels: number): string[] {
  const widest = wideLevels + widestMarkLevels
  return [wideWidthNoteOf(wideLevels, widest), wideOreNoteOf(widest), SIDEGRADE_NOTE]
}

function wideWidthNoteOf(wideLevels: number, widestLevels: number): string {
  const bare = formatAmount(boreWidthMOf(wideLevels))
  const widest = formatAmount(boreWidthMOf(widestLevels))
  return `bore width ${bare} m, ${widest} m with the widest flank cutters owned`
}

function wideOreNoteOf(widestLevels: number): string {
  const share = formatAmount(sideOreSharePercent())
  return `side cells pay ${share}% of their ore: up to +${formatAmount(oreGainPercentOf(widestLevels))}% ore a metre`
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
