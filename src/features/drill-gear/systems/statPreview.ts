/**
 * `statPreview(entryId, mark, planetIndex)` (#162 "Slice and contract"): the raw stat values an
 * item card prints for one Mark of a drill-gear item, read from `items.balance.<id>` and stepped by
 * the tree's Mark rotation. Values only; the descriptions slice formats them (#164).
 */
import { markStepOf, type MarkStatName, type MarkStats } from '../../tech-tree'
import type { DrillGearStatName } from './drillGearEconomy'
import {
  baseValueOf,
  drillGearItemOf,
  markLadderOf,
  type DrillGearItem,
  type DrillGearStat,
  type DrillGearStatUnit,
} from './drillGearItems'

export interface DrillGearStatLine {
  stat: DrillGearStatName
  label: string
  value: number
  unit: DrillGearStatUnit
}

export interface DrillGearStatPreview {
  itemId: string
  mark: number
  /** The stat this Mark changed; null for Mark 1 and past mastery. */
  stepped: MarkStatName | null
  isMastered: boolean
  /** Shown in its lane but never sold (the twin-bit head). */
  isComingSoon: boolean
  lines: readonly DrillGearStatLine[]
}

/**
 * The item's stats at `mark`, or null for an id this lane does not sell. A one-off item is the
 * same on every planet, so `_planetIndex` is the shared contract's and changes nothing here.
 */
export function statPreview(
  entryId: string,
  mark: number,
  _planetIndex: number,
): DrillGearStatPreview | null {
  const item = drillGearItemOf(entryId)
  if (item === null) return null
  return previewOf(item, mark)
}

function previewOf(item: DrillGearItem, mark: number): DrillGearStatPreview {
  const step = markStepOf(markLadderOf(item), mark)
  return {
    itemId: item.itemId,
    mark,
    stepped: step.stepped,
    isMastered: step.isMastered,
    isComingSoon: item.isComingSoon,
    lines: item.stats.map((stat) => lineOf(item, stat, step.stats)),
  }
}

/** A stat with a Mark role reads its stepped value; the others stay at Mark 1. */
function lineOf(item: DrillGearItem, stat: DrillGearStat, stepped: MarkStats): DrillGearStatLine {
  const steppedValue = stat.markRole === undefined ? undefined : stepped[stat.markRole]
  return {
    stat: stat.stat,
    label: stat.label,
    value: steppedValue ?? baseValueOf(item, stat.stat),
    unit: stat.unit,
  }
}
