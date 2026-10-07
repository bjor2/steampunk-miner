/**
 * `statPreview(entryId, mark, planetIndex)` (#162 "Slice and contract"): the raw stat values an
 * item card prints for one Mark of a sensing item, read from `sensing.economy.json` and stepped by
 * the tree's Mark rotation. Values only; the descriptions slice formats them (#164).
 */
import { markStepOf, type MarkStatName, type MarkStats } from '../../tech-tree'
import { sensingItemOf, type SensingItem } from './sensingCatalogue'
import { chargedBalanceOf, consumableBalanceOf, markLadderOf } from './sensingItems'

export type SensingStatName =
  'charges' | 'cooldown' | 'windup' | 'radius' | 'reveal' | 'stack' | 'range'

export type SensingStatUnit = 'charges' | 'ticks' | 'tiles' | 'crates'

export interface SensingStatLine {
  stat: SensingStatName
  label: string
  value: number
  unit: SensingStatUnit
}

export interface SensingStatPreview {
  itemId: string
  mark: number
  /** The stat this Mark changed; null for Mark 1, past mastery and for a passive. */
  stepped: MarkStatName | null
  isMastered: boolean
  /** Empty for a passive until #203 sets its magnitude (#162 4.6 names none). */
  lines: readonly SensingStatLine[]
}

/**
 * The item's stats at `mark`, or null for an id this lane does not sell. The stats are the same
 * on every planet, so `_planetIndex` is the shared contract's and changes nothing here.
 */
export function statPreview(
  entryId: string,
  mark: number,
  _planetIndex: number,
): SensingStatPreview | null {
  const item = sensingItemOf(entryId)
  if (item === null) return null
  return previewOf(item, mark)
}

function previewOf(item: SensingItem, mark: number): SensingStatPreview {
  const ladder = markLadderOf(item)
  const step = ladder === null ? null : markStepOf(ladder, mark)
  return {
    itemId: item.itemId,
    mark,
    stepped: step?.stepped ?? null,
    isMastered: step?.isMastered ?? false,
    lines: step === null ? [] : linesOf(item, step.stats),
  }
}

function linesOf(item: SensingItem, stats: MarkStats): readonly SensingStatLine[] {
  return item.powerUpClass === 'charged'
    ? chargedLinesOf(item, stats)
    : consumableLinesOf(item, stats)
}

function chargedLinesOf(item: SensingItem, stats: MarkStats): readonly SensingStatLine[] {
  const balance = chargedBalanceOf(item)
  return [
    line('charges', 'Charges', stats.charges ?? balance.charges, 'charges'),
    line('cooldown', 'Cooldown', stats.cooldown ?? balance.cooldownTicks, 'ticks'),
    line('windup', 'Wind-up', balance.windupTicks, 'ticks'),
    ...optionalLine('radius', 'Radius', balance.radiusTiles, 'tiles'),
    line('reveal', 'Reveal', stats.magnitude ?? balance.revealTicks, 'ticks'),
  ]
}

function consumableLinesOf(item: SensingItem, stats: MarkStats): readonly SensingStatLine[] {
  const balance = consumableBalanceOf(item)
  return [
    line('stack', 'Stack', stats.charges ?? balance.stack, 'crates'),
    ...optionalLine('range', 'Range', balance.rangeTiles, 'tiles'),
    line('radius', 'Radius', stats.magnitude ?? balance.radiusTiles, 'tiles'),
  ]
}

/** One line, or none for a stat the item does not have. */
function optionalLine(
  stat: SensingStatName,
  label: string,
  value: number | null,
  unit: SensingStatUnit,
): SensingStatLine[] {
  return value === null ? [] : [line(stat, label, value, unit)]
}

function line(
  stat: SensingStatName,
  label: string,
  value: number,
  unit: SensingStatUnit,
): SensingStatLine {
  return { stat, label, value, unit }
}
