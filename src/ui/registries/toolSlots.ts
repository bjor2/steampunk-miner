/**
 * The tool slot bar's rows (ticket 691, the HS kinds of #678; the rules in
 * `systems/input/toolSlots.ts`): the kernel's rows, then each slice's, read in bar position order.
 * A row is a touch binding too, so the seal refuses it on any #474 binding rule as well as on the
 * bar's own: a whole position from 1, Digit n pressing a row at position n up to 8, and no
 * position two rows share. The kernel draws every cell; a row whose press is more than a tap (a
 * slot's hold card, the bore gun's drag aim) names the `Cell` it draws around the kernel's.
 */
import type { ComponentType } from 'react'
import { ACTION_MAP } from '../../systems/input/actionMap'
import {
  KERNEL_TOOL_SLOT_RULES,
  sharedPositionProblemsOf,
  toolSlotRuleProblemsOf,
  type ToolFace,
  type ToolSlotRule,
} from '../../systems/input/toolSlots'
import { sliceRowProblemsOf, touchBindingProblemsOf } from '../../systems/input/touchBindings'
import { defineRegistry, entriesOf, type SealedRegistration } from '../../systems/registries/seal'
import { PlantChargeCell } from '../toolSlots/PlantChargeCell'

/** What a row's own cell is handed: the face the bar read for it this refresh. */
export interface ToolCellProps<F extends ToolFace = ToolFace> {
  face: F
}

export interface ToolSlotRow<F extends ToolFace = ToolFace> extends ToolSlotRule<F> {
  /** The cell the row draws, built on the kernel's `ToolCell`; absent, the kernel's tap cell. */
  Cell?: ComponentType<ToolCellProps<F>>
}

export const TOOL_SLOT_REGISTRY = defineRegistry<ToolSlotRow>('toolSlots', sealProblemOf)

/** Plant charge carries the charge size badge (#473 rides the cell); the guns toggle is a tap. */
const KERNEL_TOOL_SLOT_ROWS: readonly ToolSlotRow[] = KERNEL_TOOL_SLOT_RULES.map((rule) =>
  rule.touch.action === 'plant_charge' ? { ...rule, Cell: PlantChargeCell } : rule,
)

/**
 * A row whose cell reads more than the shared face (a slot's hold ring, the gun's lamp): typed
 * against its own face here, stored as a plain row, since the bar hands each cell its own face.
 */
export function defineToolSlotRow<F extends ToolFace>(row: ToolSlotRow<F>): ToolSlotRow {
  return row as unknown as ToolSlotRow
}

/** The kernel's rows and every registered one, by bar position. */
export function toolSlotRows(): readonly ToolSlotRow[] {
  return [...KERNEL_TOOL_SLOT_ROWS, ...entriesOf(TOOL_SLOT_REGISTRY)].sort(
    (a, b) => a.position - b.position,
  )
}

/** The registered rows alone, as touch bindings join them (#474 coverage). */
export function registeredToolSlotRows(): readonly ToolSlotRow[] {
  return entriesOf(TOOL_SLOT_REGISTRY)
}

export function toolSlotRowOf(rowId: string): ToolSlotRow | null {
  return toolSlotRows().find((row) => row.id === rowId) ?? null
}

function sealProblemOf(registrations: readonly SealedRegistration<ToolSlotRow>[]) {
  const rows = registrations.map(({ entry }) => entry)
  const problems = [
    ...rows.flatMap(registeredRowProblemsOf),
    ...sharedPositionProblemsOf([...KERNEL_TOOL_SLOT_RULES, ...rows]),
  ]
  return problems.length === 0 ? null : problems.join('; ')
}

function registeredRowProblemsOf(row: ToolSlotRow): string[] {
  return [
    ...touchBindingProblemsOf(row, ACTION_MAP),
    ...sliceRowProblemsOf(row),
    ...toolSlotRuleProblemsOf(row, ACTION_MAP),
  ]
}
