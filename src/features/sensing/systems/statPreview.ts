/**
 * `statPreview(entryId, mark, planetIndex)` (#162 "Slice and contract"): the raw stat values an
 * item card prints for one Mark of a sensing item, read from `sensing.economy.json` and stepped by
 * the tree's Mark rotation. Values only; the descriptions slice formats them (#164).
 */
import { markStepOf, type MarkStatName, type MarkStats } from '../../tech-tree'
import { passiveReachOf } from './passiveReach'
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
  /** Whether a Mark of the item steps it; a card shows a next value only for these. */
  isMarkStepped: boolean
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
    lines: linesOf(item, mark, step.stats),
  }
}

function linesOf(item: SensingItem, mark: number, stats: MarkStats): readonly SensingStatLine[] {
  if (item.powerUpClass === 'charged') return chargedLinesOf(item, stats)
  if (item.powerUpClass === 'consumable') return consumableLinesOf(item, stats)
  return passiveLinesOf(item, mark)
}

function chargedLinesOf(item: SensingItem, stats: MarkStats): readonly SensingStatLine[] {
  const balance = chargedBalanceOf(item)
  return [
    stepped('charges', 'Charges', stats.charges ?? balance.charges, 'charges'),
    stepped('cooldown', 'Cooldown', stats.cooldown ?? balance.cooldownTicks, 'ticks'),
    fixed('windup', 'Wind-up', balance.windupTicks, 'ticks'),
    ...optionalFixed('radius', 'Radius', balance.radiusTiles, 'tiles'),
    stepped('reveal', 'Reveal', stats.magnitude ?? balance.revealTicks, 'ticks'),
  ]
}

function consumableLinesOf(item: SensingItem, stats: MarkStats): readonly SensingStatLine[] {
  const balance = consumableBalanceOf(item)
  return [
    stepped('stack', 'Stack', stats.charges ?? balance.stack, 'crates'),
    fixed('windup', 'Wind-up', balance.windupTicks, 'ticks'),
    ...optionalFixed('range', 'Range', balance.rangeTiles, 'tiles'),
    stepped('radius', 'Radius', stats.magnitude ?? balance.radiusTiles, 'tiles'),
  ]
}

/**
 * A ring around the miner in tiles (periscope, lens), or cells ahead of the drill (barometer), at
 * the GD's rounding rule, so every Mark adds reach.
 */
function passiveLinesOf(item: SensingItem, mark: number): readonly SensingStatLine[] {
  const magnitude = passiveReachOf(item, mark)
  return passiveBalanceOf(item).reach === 'radius'
    ? [stepped('radius', 'Radius', magnitude, 'tiles')]
    : [stepped('lookahead', 'Lookahead', magnitude, 'cells')]
}

/** One fixed line, or none for a stat the item does not have. */
function optionalFixed(
  stat: SensingStatName,
  label: string,
  value: number | null,
  unit: SensingStatUnit,
): SensingStatLine[] {
  return value === null ? [] : [fixed(stat, label, value, unit)]
}

/** A stat some Mark of the item steps. */
function stepped(
  stat: SensingStatName,
  label: string,
  value: number,
  unit: SensingStatUnit,
): SensingStatLine {
  return { stat, label, value, unit, isMarkStepped: true }
}

/** A stat no Mark changes: the wind-up, the echo's radius, the mortar's range. */
function fixed(
  stat: SensingStatName,
  label: string,
  value: number,
  unit: SensingStatUnit,
): SensingStatLine {
  return { stat, label, value, unit, isMarkStepped: false }
}
