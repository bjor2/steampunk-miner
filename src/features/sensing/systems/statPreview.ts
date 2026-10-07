/**
 * `statPreview(entryId, mark, planetIndex)` (#162 "Slice and contract"): the raw stat values an
 * item card prints for one Mark of a sensing item, read from `sensing.economy.json` and stepped by
 * the tree's Mark rotation. Values only; the descriptions slice formats them (#164).
 */
import { markStepOf, type MarkStatName, type MarkStats } from '../../tech-tree'
import { sensingItemOf, type SensingItem } from './sensingCatalogue'
import {
  chargedBalanceOf,
  consumableBalanceOf,
  markLadderOf,
  passiveBalanceOf,
} from './sensingItems'

export type SensingStatName =
  'charges' | 'cooldown' | 'windup' | 'radius' | 'reveal' | 'stack' | 'range' | 'lookahead'

export type SensingStatUnit = 'charges' | 'ticks' | 'tiles' | 'crates' | 'cells'

export interface SensingStatLine {
  stat: SensingStatName
  label: string
  value: number
  unit: SensingStatUnit
}

export interface SensingStatPreview {
  itemId: string
  mark: number
  /** The stat this Mark changed; null for Mark 1 and past mastery. */
  stepped: MarkStatName | null
  isMastered: boolean
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
  const step = markStepOf(markLadderOf(item), mark)
  return {
    itemId: item.itemId,
    mark,
    stepped: step.stepped,
    isMastered: step.isMastered,
    lines: linesOf(item, step.stats),
  }
}

function linesOf(item: SensingItem, stats: MarkStats): readonly SensingStatLine[] {
  if (item.powerUpClass === 'charged') return chargedLinesOf(item, stats)
  if (item.powerUpClass === 'consumable') return consumableLinesOf(item, stats)
  return passiveLinesOf(item, stats)
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

/** A ring around the miner in tiles (periscope, lens), or cells ahead of the drill (barometer). */
function passiveLinesOf(item: SensingItem, stats: MarkStats): readonly SensingStatLine[] {
  const balance = passiveBalanceOf(item)
  const magnitude = stats.magnitude ?? balance.magnitude
  return balance.reach === 'radius'
    ? [line('radius', 'Radius', magnitude, 'tiles')]
    : [line('lookahead', 'Lookahead', magnitude, 'cells')]
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
