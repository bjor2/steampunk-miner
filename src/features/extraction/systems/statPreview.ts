/**
 * `statPreview(entryId, mark, planetIndex)` (#162 "Slice and contract"): the raw stat values an
 * item card prints for one Mark of a drain or siphon, read from `items.balance.<id>` and stepped
 * by the tree's Mark rotation. Values only; the descriptions slice formats them (#164).
 */
import { markStepOf, type MarkStatName } from '../../tech-tree'
import { balanceOf, extractionItemOf, markLadderOf, type ExtractionItem } from './extractionItems'

export type ExtractionStatName = 'charges' | 'cooldown' | 'act' | 'reach' | 'cells'

export type ExtractionStatUnit = 'charges' | 'ticks' | 'tiles' | 'cells'

export interface ExtractionStatLine {
  stat: ExtractionStatName
  label: string
  value: number
  unit: ExtractionStatUnit
}

export interface ExtractionStatPreview {
  itemId: string
  mark: number
  /** The stat this Mark changed; null for Mark 1 and past mastery. */
  stepped: MarkStatName | null
  isMastered: boolean
  lines: readonly ExtractionStatLine[]
}

/**
 * The item's stats at `mark`, or null for an id this lane does not sell. A one-off item is the
 * same on every planet, so `_planetIndex` is the shared contract's and changes nothing here.
 */
export function statPreview(
  entryId: string,
  mark: number,
  _planetIndex: number,
): ExtractionStatPreview | null {
  const item = extractionItemOf(entryId)
  if (item === null) return null
  return previewOf(item, mark)
}

function previewOf(item: ExtractionItem, mark: number): ExtractionStatPreview {
  const step = markStepOf(markLadderOf(item), mark)
  const balance = balanceOf(item)
  return {
    itemId: item.itemId,
    mark,
    stepped: step.stepped,
    isMastered: step.isMastered,
    lines: [
      line('charges', 'Charges', step.stats.charges ?? balance.charges, 'charges'),
      line('cooldown', 'Cooldown', step.stats.cooldown ?? balance.cooldownTicks, 'ticks'),
      line('act', item.actLabel, balance.actTicks, 'ticks'),
      line('reach', item.reachLabel, balance.reachTiles, 'tiles'),
      line('cells', 'Cells per use', step.stats.magnitude ?? balance.cellsPerUse, 'cells'),
    ],
  }
}

function line(
  stat: ExtractionStatName,
  label: string,
  value: number,
  unit: ExtractionStatUnit,
): ExtractionStatLine {
  return { stat, label, value, unit }
}
