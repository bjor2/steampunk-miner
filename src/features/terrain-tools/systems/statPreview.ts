/**
 * `statPreview(entryId, mark, planetIndex)` (#162 "Slice and contract"): the raw stat values an
 * item card prints for one Mark of a terrain tool, read from `items.balance.<id>` and stepped by
 * the tree's Mark rotation, the size held at the TD's terrain cap. Values only; the descriptions
 * slice formats them (#164).
 */
import { markStepOf, type MarkStatName } from '../../tech-tree'
import type { TerrainBalance } from './terrainEconomy'
import {
  balanceOf,
  isConsumable,
  markLadderOf,
  terrainItemOf,
  type TerrainItem,
  type TerrainSizeUnit,
} from './terrainItems'

export type TerrainStatName = 'charges' | 'cooldown' | 'windup' | 'reach' | 'size' | 'swaps'

export type TerrainStatUnit = 'charges' | 'units' | 'ticks' | 'swaps' | TerrainSizeUnit

export interface TerrainStatLine {
  stat: TerrainStatName
  label: string
  value: number
  unit: TerrainStatUnit
}

export interface TerrainStatPreview {
  itemId: string
  mark: number
  /** The stat this Mark changed; null for Mark 1 and past mastery. */
  stepped: MarkStatName | null
  isMastered: boolean
  lines: readonly TerrainStatLine[]
}

/**
 * The item's stats at `mark`, or null for an id this lane does not sell. A stat is the same on
 * every planet (only a consumable's price moves), so `_planetIndex` is the shared contract's.
 */
export function statPreview(
  entryId: string,
  mark: number,
  _planetIndex: number,
): TerrainStatPreview | null {
  const item = terrainItemOf(entryId)
  if (item === null) return null
  return previewOf(item, mark)
}

function previewOf(item: TerrainItem, mark: number): TerrainStatPreview {
  const step = markStepOf(markLadderOf(item), mark)
  const balance = balanceOf(item)
  const stepped: SteppedStats = {
    charges: step.stats.charges ?? balance.charges,
    cooldown: step.stats.cooldown ?? balance.cooldownTicks,
    size: step.stats.magnitude ?? balance.magnitude,
  }
  return {
    itemId: item.itemId,
    mark,
    stepped: step.stepped,
    isMastered: step.isMastered,
    lines: linesOf(item, balance, stepped),
  }
}

interface SteppedStats {
  charges: number
  cooldown: number | undefined
  size: number
}

/** The lines this item has, in card order: a line it lacks is left out, never printed as zero. */
function linesOf(item: TerrainItem, balance: TerrainBalance, stats: SteppedStats) {
  const candidates: (TerrainStatLine | null)[] = [
    chargesLineOf(item, stats.charges),
    optionalLine('cooldown', 'Cooldown', stats.cooldown, 'ticks'),
    optionalLine('windup', 'Wind-up', balance.windupTicks, 'ticks'),
    optionalLine('reach', item.reachLabel ?? '', reachOf(item, balance), 'tiles'),
    line('size', item.sizeLabel, stats.size, item.sizeUnit),
    optionalLine('swaps', 'Swaps per beacon', balance.swapCap, 'swaps'),
  ]
  return candidates.filter((candidate) => candidate !== null)
}

/** A consumable's charges are its stack on the rack. */
function chargesLineOf(item: TerrainItem, charges: number): TerrainStatLine {
  if (isConsumable(item)) return line('charges', 'Stack', charges, 'units')
  return line('charges', 'Charges', charges, 'charges')
}

function reachOf(item: TerrainItem, balance: TerrainBalance): number | undefined {
  return item.reachLabel === null ? undefined : balance.reachTiles
}

function optionalLine(
  stat: TerrainStatName,
  label: string,
  value: number | undefined,
  unit: TerrainStatUnit,
): TerrainStatLine | null {
  return value === undefined ? null : line(stat, label, value, unit)
}

function line(
  stat: TerrainStatName,
  label: string,
  value: number,
  unit: TerrainStatUnit,
): TerrainStatLine {
  return { stat, label, value, unit }
}
