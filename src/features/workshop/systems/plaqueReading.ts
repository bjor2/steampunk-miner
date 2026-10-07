/**
 * What a track's plaque around the showcase reads (#180 section 1 "Tempt the spree", section 2
 * stops; the GD's rules 3-5): its rivet pips toward the next big level, the last one glowing when
 * the jump is one buy away, and one line under them. Before a hold the line tempts ("can buy ×12,
 * 1 big level"); while one runs it counts ("×7 · 1,200"); after it ends it says how ("keeping 1.2k
 * for service", or the MAX stamp). Words only from the rule; amounts through `formatAmount`.
 */
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import { isMajorStep, minorsPerMajor, pipOf } from '../../../systems/economy/upgradeSteps'
import { formatAmount } from '../../../systems/displayAmount'
import type { Money } from '../../../systems/money'
import type { ChainStopCue } from './chainCues'
import type { ChainPreview } from './chainPreview'
import SHOWCASE_FILE from '../showcase.json'

export interface PipRow {
  /** Rivet pips filled toward the next big level, of `count`. */
  filled: number
  count: number
  /** The next buy is the big level-up: the last pip glows. */
  isJumpNext: boolean
}

/** The latest hold's count, as the store keeps it. */
export interface PlaqueTally {
  upgradeId: UpgradeId
  steps: number
  spent: Money
  cue: ChainStopCue | null
}

export type PlaqueLineKind = 'tempt' | 'chain' | 'stopped' | 'reserve' | 'max' | 'quiet'

export interface PlaqueLine {
  kind: PlaqueLineKind
  text: string
}

export type PlaqueSide = 'front' | 'rear'

export const PLAQUE_SIDES: Readonly<Record<PlaqueSide, readonly UpgradeId[]>> =
  SHOWCASE_FILE.plaqueSides as Record<PlaqueSide, UpgradeId[]>

/** The rows of one side's plaques, top to bottom as `plaqueSides` orders them. */
export function rowsOnSide<Row extends { upgradeId: UpgradeId }>(
  rows: readonly Row[],
  side: PlaqueSide,
): Row[] {
  return PLAQUE_SIDES[side].flatMap((id) => rows.filter((row) => row.upgradeId === id))
}

export function pipRowOf(step: number): PipRow {
  return { filled: pipOf(step), count: minorsPerMajor() - 1, isJumpNext: isMajorStep(step) }
}

/**
 * The plaque's line: the tally of this track's latest hold once one ran, else the preview of
 * what a hold would buy now. `reserve` is what a held step keeps back for service.
 */
export function plaqueLineOf(
  upgradeId: UpgradeId,
  tally: PlaqueTally | null,
  preview: ChainPreview,
  reserve: Money,
): PlaqueLine {
  if (tally === null || tally.upgradeId !== upgradeId) return temptLineOf(preview)
  if (tally.cue === null) return { kind: 'chain', text: countTextOf(tally) }
  return stoppedLineOf(tally, reserve)
}

function temptLineOf(preview: ChainPreview): PlaqueLine {
  if (preview.steps === 0) return { kind: 'quiet', text: '' }
  const more = preview.stoppedBy === 'preview_limit' ? '+' : ''
  const majors = preview.majors === 0 ? '' : `, ${bigLevelsTextOf(preview.majors)}`
  return { kind: 'tempt', text: `can buy ×${preview.steps}${more}${majors}` }
}

function bigLevelsTextOf(majors: number): string {
  return majors === 1 ? '1 big level' : `${majors} big levels`
}

function stoppedLineOf(tally: PlaqueTally, reserve: Money): PlaqueLine {
  if (tally.cue === 'reserve_hold') {
    return { kind: 'reserve', text: `keeping ${formatAmount(reserve)} for service` }
  }
  if (tally.cue === 'max_stamp') return { kind: 'max', text: 'MAX' }
  return { kind: 'stopped', text: countTextOf(tally) }
}

function countTextOf(tally: PlaqueTally): string {
  return `×${tally.steps} · ${formatAmount(tally.spent)}`
}
