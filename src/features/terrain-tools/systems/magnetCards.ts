/**
 * The terrain magnets' card entries (#159, the K7 `itemDescriptionEntries` seam), with Content's
 * copy from #282: the flavour line and one stat line per `cardLines` line, each number read when
 * the card is drawn, never written into the copy (Systems, 7 Oct). "Up to {maxCellsMoved}" reads
 * the kernel `magnets` block; the wave radius and the clamp's duration read the Mark the card's
 * level names, and show the next Mark's value until the item is Mastered.
 *
 * Each member's entry registers with its effect (`SHIPPED_MAGNET_ITEMS`, ticket 284 onwards).
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { ECONOMY } from '../../../systems/economy/economy'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, markStepOf } from '../../tech-tree'
import {
  MAGNET_ITEMS,
  magnetItemOf,
  magnetMarkLadderOf,
  type MagnetCardLine,
  type MagnetItem,
  type MagnetReading,
} from './magnetItems'

const FIRST_MARK = 1

/** Tenths of a second: a stepped duration reads 3.5 s, not 3.45 s. */
const TENTHS_PER_SECOND = 10

export const MAGNET_ITEM_CARDS: readonly ItemDescriptionEntry[] = MAGNET_ITEMS.map(magnetCardOf)

export function magnetCardOf(item: MagnetItem): ItemDescriptionEntry {
  return {
    id: `terrain-tools.${item.itemId.slice('power.'.length)}`,
    matches: { kind: 'vehicle-item', id: item.itemId },
    flavour: item.description,
    statLines: item.cardLines.map((line) => lineSpecOf(item, line)),
  }
}

function lineSpecOf(item: MagnetItem, line: MagnetCardLine): DescribedStatLineSpec {
  return {
    label: line.label,
    kind: 'linearInt',
    value: (_ref: ItemRef, ctx: ItemCtx) => readingAt(item, line.reading, markOfLevel(ctx.level)),
    textOf: (level: number) => lineTextAt(item, line, markOfLevel(level)),
    nextLevel: isMarkStepped(line) ? nextMarkOf : hasNoNextLevel,
  }
}

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

/**
 * The cells-moved cap and a line of words are the same at every Mark; the radius and the duration
 * are Mark-stepped.
 */
function isMarkStepped(line: MagnetCardLine): boolean {
  return line.reading === 'radius' || line.reading === 'duration'
}

function lineTextAt(item: MagnetItem, line: MagnetCardLine, mark: number): string {
  if (line.reading === null) return line.template
  const shown = shownReadingOf(line.reading, readingAt(item, line.reading, mark))
  return line.template.replace(`{${line.reading}}`, shown)
}

/** The raw value: whole cells, the hold's whole ticks, or none for a line of words. */
function readingAt(item: MagnetItem, reading: MagnetReading | null, mark: number): number {
  if (reading === null) return 0
  if (reading === 'maxCellsMoved') return ECONOMY.magnets.maxCellsMoved
  return markStepOf(magnetMarkLadderOf(item), mark).stats.magnitude ?? 0
}

function shownReadingOf(reading: MagnetReading, value: number): string {
  return reading === 'duration' ? secondsTextOf(value) : `${value}`
}

/** 180 ticks reads "3 s"; 207 reads "3.5 s". */
function secondsTextOf(ticks: number): string {
  const tenths = Math.round((ticks * TENTHS_PER_SECOND) / TICKS_PER_SECOND)
  return `${tenths / TENTHS_PER_SECOND} s`
}

function nextMarkOf(ref: ItemRef, ctx: ItemCtx): number | null {
  const mark = markOfLevel(ctx.level)
  const item = magnetItemOf(ref.id)
  if (item === null || isMasteredAt(magnetMarkLadderOf(item), mark)) return null
  return mark + 1
}
