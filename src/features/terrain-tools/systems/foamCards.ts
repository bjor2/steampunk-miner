/**
 * Stabiliser foam's card lines (Content on #381, matched to the GD default ruling, ticket 381):
 * foam "sets" and "hardens", never "braces", so it never reads like the lode clamp. Each number is
 * read when the card is drawn, never written into the copy: the cone's radius at the Mark the
 * card's level names, the brace's length, the cone's Mark bonus against its cap, the Mark foam cures
 * at (ticket 368; no Content line yet, so the words are this ticket's) and the stack research grants.
 *
 * The Charges line (Content's addendum on #381) reads the live `{charges} left` and, since the
 * restock (ticket 394), its second half is the restock price line: one charge's price on the
 * card's planet, bought back at the Upgrade bay. A player who does not own foam never sees the
 * line, as no surface draws foam's card for them: it has no seller, so no shop row, and the
 * restock's bay entry lists owned foam only.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { formatAmount } from '../../../systems/displayAmount'
import type { Money } from '../../../systems/money'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { chargesLeftInViewOf } from '../../power-up-core'
import { isMasteredAt, lastMarkOf } from '../../tech-tree'
import { foamRestockPriceAt } from './foamRestock'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { foamCureMark, STABILISER_FOAM_ID } from './stabiliserFoam'
import { balanceOf, markLadderOf, type TerrainItem } from './terrainItems'

/** What a line reads, or null for a line of words. */
type FoamReading = 'coneRadius' | 'duration' | 'coneRadiusBonus'

/** What the Charges line quotes from the card's snapshot: the charges left and one's restock. */
export interface FoamStock {
  chargesLeft: number
  unitPrice: Money
}

export interface FoamCardLine {
  label: string
  template: string
  reading: FoamReading | null
}

const FIRST_MARK = 1

/** Tenths of a second: a duration reads 10 s, or 3.5 s, never 3.45 s. */
const TENTHS_PER_SECOND = 10

export const FOAM_CARD_LINES: readonly FoamCardLine[] = [
  {
    label: 'Tap',
    template:
      'sets foam in a forward cone {coneRadius} cells deep; the rock there hardens and holds',
    reading: 'coneRadius',
  },
  { label: 'Lasts', template: '{duration}; foaming again resets the timer', reading: 'duration' },
  {
    label: 'When it crumbles',
    template: 'the roof warns again before it can fall',
    reading: null,
  },
  { label: 'Note', template: 'foamed rock keeps its hardness and price', reading: null },
  {
    label: 'Cone',
    template: '+{coneRadiusBonus} cells, up to +{coneRadiusCap}',
    reading: 'coneRadiusBonus',
  },
  {
    label: 'Cure',
    template: 'from Mark {cureMark} foamed rock sets for good, billed as lining at its band',
    reading: null,
  },
  {
    label: 'Charges',
    template: '{charges} left; restock {unitPrice} a charge at the Upgrade bay',
    reading: null,
  },
]

/** Content's lines, in card order. */
export function foamLineSpecs(): DescribedStatLineSpec[] {
  return FOAM_CARD_LINES.map(lineSpecOf)
}

/** A line's words at `mark` with `stock` left, its numbers filled in. */
export function foamLineTextAt(line: FoamCardLine, mark: number, stock: FoamStock): string {
  const foam = terrainItemNamed(STABILISER_FOAM_ID)
  return line.template
    .replace('{coneRadius}', `${magnitudeAt(foam, mark)}`)
    .replace('{duration}', secondsTextOf(braceTicksOf(foam)))
    .replace('{coneRadiusBonus}', `${coneBonusAt(foam, mark)}`)
    .replace('{coneRadiusCap}', `${coneBonusAt(foam, lastMarkOf(markLadderOf(foam)))}`)
    .replace('{charges}', `${stock.chargesLeft}`)
    .replace('{unitPrice}', formatAmount(stock.unitPrice))
    .replace('{cureMark}', `${foamCureMark()}`)
}

function lineSpecOf(line: FoamCardLine): DescribedStatLineSpec {
  return {
    label: line.label,
    kind: 'linearInt',
    value: (_ref: ItemRef, ctx: ItemCtx) => readingAt(line.reading, markOfLevel(ctx.level)),
    textIn: (ctx: ItemCtx) => foamLineTextAt(line, markOfLevel(ctx.level), stockOf(ctx)),
    nextLevel: isMarkStepped(line) ? nextMarkOf : hasNoNextLevel,
  }
}

/** The player's charges left, read off the card's snapshot, and one charge's restock here. */
function stockOf(ctx: ItemCtx): FoamStock {
  return {
    chargesLeft: chargesLeftInViewOf(ctx.view, STABILISER_FOAM_ID),
    unitPrice: foamRestockPriceAt(ctx.planetIndex),
  }
}

/** The cone grows with the Marks; the brace's length and the words do not. */
function isMarkStepped(line: FoamCardLine): boolean {
  return line.reading === 'coneRadius' || line.reading === 'coneRadiusBonus'
}

function readingAt(reading: FoamReading | null, mark: number): number {
  const foam = terrainItemNamed(STABILISER_FOAM_ID)
  if (reading === 'coneRadius') return magnitudeAt(foam, mark)
  if (reading === 'coneRadiusBonus') return coneBonusAt(foam, mark)
  if (reading === 'duration') return braceTicksOf(foam)
  return 0
}

/** The cells the Marks have added to the cone, over Mark 1's. */
function coneBonusAt(foam: TerrainItem, mark: number): number {
  return magnitudeAt(foam, mark) - magnitudeAt(foam, FIRST_MARK)
}

function braceTicksOf(foam: TerrainItem): number {
  return balanceOf(foam).braceTicks ?? 0
}

function secondsTextOf(ticks: number): string {
  const tenths = Math.round((ticks * TENTHS_PER_SECOND) / TICKS_PER_SECOND)
  return `${tenths / TENTHS_PER_SECOND} s`
}

function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function nextMarkOf(_ref: ItemRef, ctx: ItemCtx): number | null {
  const mark = markOfLevel(ctx.level)
  const ladder = markLadderOf(terrainItemNamed(STABILISER_FOAM_ID))
  return isMasteredAt(ladder, mark) ? null : mark + 1
}
