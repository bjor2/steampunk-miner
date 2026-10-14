/**
 * Stabiliser foam's card lines (Content on #381, matched to the GD default ruling, ticket 381):
 * foam "sets" and "hardens", never "braces", so it never reads like the lode clamp. Each number is
 * read when the card is drawn, never written into the copy: the cone's radius at the Mark the
 * card's level names, the brace's length, the cone's Mark bonus against its cap and the stack
 * research grants.
 *
 * The Charges line (Content's addendum on #381) reads only where charges come from. Its live
 * `{charges} left` waits for the restock (#394), which rewrites the line into its price: a card
 * line gets no view of power-up-core's spent charges today. A player who does not own foam never
 * sees the line, as no surface draws foam's card for them: it has no seller, so no shop row.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, lastMarkOf } from '../../tech-tree'
import { foamStartingCount } from './foamResearch'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { STABILISER_FOAM_ID } from './stabiliserFoam'
import { balanceOf, markLadderOf, type TerrainItem } from './terrainItems'

/** What a line reads, or null for a line of words. */
type FoamReading = 'coneRadius' | 'duration' | 'coneRadiusBonus'

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
    label: 'Charges',
    template: 'research grants {startingCount}, restock comes later',
    reading: null,
  },
]

/** Content's lines, in card order. */
export function foamLineSpecs(): DescribedStatLineSpec[] {
  return FOAM_CARD_LINES.map(lineSpecOf)
}

/** A line's words at `mark`, its numbers filled in. */
export function foamLineTextAt(line: FoamCardLine, mark: number): string {
  const foam = terrainItemNamed(STABILISER_FOAM_ID)
  return line.template
    .replace('{coneRadius}', `${magnitudeAt(foam, mark)}`)
    .replace('{duration}', secondsTextOf(braceTicksOf(foam)))
    .replace('{coneRadiusBonus}', `${coneBonusAt(foam, mark)}`)
    .replace('{coneRadiusCap}', `${coneBonusAt(foam, lastMarkOf(markLadderOf(foam)))}`)
    .replace('{startingCount}', `${foamStartingCount()}`)
}

function lineSpecOf(line: FoamCardLine): DescribedStatLineSpec {
  return {
    label: line.label,
    kind: 'linearInt',
    value: (_ref: ItemRef, ctx: ItemCtx) => readingAt(line.reading, markOfLevel(ctx.level)),
    textOf: (level: number) => foamLineTextAt(line, markOfLevel(level)),
    nextLevel: isMarkStepped(line) ? nextMarkOf : hasNoNextLevel,
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
