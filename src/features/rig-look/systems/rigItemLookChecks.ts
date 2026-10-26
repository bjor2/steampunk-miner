/**
 * What makes the rig look table's item tracks unloadable (ticket 623; TD ruling 6307937801 and the
 * GD lock of 25 Oct on #623): every problem listed, nothing trimmed. An item track is keyed by a
 * catalogue item id that no other track takes, says how its item counts as equipped (slotted, or a
 * fork branch), lists later Marks rising from 2, and steps from `n = 1` with parts its look asset
 * has. That an id names an item the game sells or a branch the tree registers is the shipped
 * table's spec (`drillTypeLooks.test.ts`), since no module reads a registry when it loads.
 */
import { bareCatalogueIdProblems } from '../../../systems/registries/catalogueIds'
import {
  FORK_EQUIP,
  SLOTTED_EQUIP,
  type RigItemLookRows,
  type RigItemLookStepRow,
  type RigItemMark,
} from './render/rigItemLooks'
import { replacedSlotProblemsOf, slotProblemsOf } from './rigLookPointChecks'

const FIRST_MARK = 2
const SLOTTED_ONLY = 'a slotted equip names no lane or branch'

/** Every problem with the item tracks, given the upgrade tracks and look assets the table has. */
export function itemTrackProblemsOf(
  items: readonly RigItemLookRows[],
  upgradeTracks: readonly string[],
  lookAssets: Readonly<Record<string, readonly string[]>>,
): string[] {
  return items.flatMap((rows) =>
    [
      ...itemIdProblemsOf(rows, items, upgradeTracks),
      ...equipProblemsOf(rows),
      ...markProblemsOf(rows),
      ...slotProblemsOf(rows.slot),
      ...replacedSlotProblemsOf(rows.replaces),
      ...itemStepProblemsOf(rows, lookAssets),
    ].map((problem) => `${rows.track}: ${problem}`),
  )
}

function itemIdProblemsOf(
  rows: RigItemLookRows,
  items: readonly RigItemLookRows[],
  upgradeTracks: readonly string[],
): string[] {
  const problems = bareCatalogueIdProblems(rows.track).map((problem) => `item id ${problem}`)
  if (items.filter((other) => other.track === rows.track).length > 1) {
    problems.push('has more than one row block')
  }
  if (upgradeTracks.includes(rows.track)) problems.push('is an upgrade track')
  return problems
}

function equipProblemsOf(rows: RigItemLookRows): string[] {
  const { kind, lane, branch } = rows.equip
  if (kind === SLOTTED_EQUIP)
    return lane === undefined && branch === undefined ? [] : [SLOTTED_ONLY]
  if (kind !== FORK_EQUIP) return [`equip ${kind} is not ${SLOTTED_EQUIP} or ${FORK_EQUIP}`]
  return isName(lane) && isName(branch) ? [] : ['a fork equip needs its lane and branch']
}

/** Later Marks rise from 2, each an item of its own. */
function markProblemsOf(rows: RigItemLookRows): string[] {
  return (rows.marks ?? []).flatMap((mark, at, marks) =>
    laterMarkProblemsOf(rows, mark, at === 0 ? FIRST_MARK - 1 : marks[at - 1].mark).map(
      (problem) => `Mark ${mark.mark}: ${problem}`,
    ),
  )
}

function laterMarkProblemsOf(rows: RigItemLookRows, mark: RigItemMark, before: number): string[] {
  const problems: string[] = []
  if (!Number.isInteger(mark.mark) || mark.mark <= before) problems.push('does not rise from 2')
  if (bareCatalogueIdProblems(mark.itemId).length > 0) problems.push('is not an item id')
  if (mark.itemId === rows.track) problems.push("is the track's own item")
  return problems
}

/** Steps rise from `n = 1`, each with parts of its look asset, none repeated. */
function itemStepProblemsOf(
  rows: RigItemLookRows,
  lookAssets: Readonly<Record<string, readonly string[]>>,
): string[] {
  if (rows.steps.length === 0) return ['has no step']
  return rows.steps.flatMap((step, at) =>
    [
      ...stepFromProblemsOf(step, at === 0 ? 0 : rows.steps[at - 1].from),
      ...stepPartProblemsOf(step, lookAssets),
    ].map((problem) => `step from ${step.from}: ${problem}`),
  )
}

function stepFromProblemsOf(step: RigItemLookStepRow, before: number): string[] {
  if (before === 0 && step.from !== 1) return ['the first step is not from 1']
  return Number.isInteger(step.from) && step.from > before ? [] : ['from does not rise']
}

function stepPartProblemsOf(
  step: RigItemLookStepRow,
  lookAssets: Readonly<Record<string, readonly string[]>>,
): string[] {
  const parts = lookAssets[step.asset]
  if (parts === undefined) return [`asset ${step.asset} is not a look asset`]
  const problems = step.parts
    .filter((part) => !parts.includes(part))
    .map((part) => `part ${part} is not a part of ${step.asset}`)
  if (step.parts.length === 0) problems.push('has no part')
  if (new Set(step.parts).size !== step.parts.length) problems.push('repeats a part')
  return problems
}

function isName(value: string | undefined): boolean {
  return value !== undefined && value.length > 0
}
