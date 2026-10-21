/**
 * The touch bindings (#474, the HS decision on #470): the kernel's rows, then each slice's, sealed
 * and read sorted by id like `hudPanels`. A slice row may carry the `Tile` it draws on the touch
 * controls; rows one control serves share its component, drawn once. A row with no tile is `none`
 * or rides a kernel control that presses its action (the plunger on the bar's Plant charge cell).
 * The tool slot bar's rows (ticket 691) are touch bindings too and join the list after these.
 * The rules live in `systems/input/touchBindings.ts`; the seal refuses a row that breaks one.
 */
import type { ComponentType } from 'react'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { ACTION_MAP } from '../../systems/input/actionMap'
import { KERNEL_TOUCH_BINDINGS } from '../../systems/input/kernelTouchBindings'
import {
  isTouchAnchorExposed,
  sliceRowProblemsOf,
  touchBindingProblemsOf,
  undrawnRowProblemsOf,
  type TouchBindingRule,
} from '../../systems/input/touchBindings'
import { defineRegistry, entriesOf, type SealedRegistration } from '../../systems/registries/seal'
import { registeredToolSlotRows } from './toolSlots'

export interface TouchBindingRow extends TouchBindingRule {
  /** The control the slice draws for the row; absent, the row is `none` or rides a kernel one. */
  Tile?: ComponentType
}

export const TOUCH_BINDING_REGISTRY = defineRegistry<TouchBindingRow>(
  'touchBindings',
  sealProblemOf,
)

/** The kernel's rows, then every registered one, then the slices' tool slots, by id. */
export function touchBindingRows(): readonly TouchBindingRow[] {
  return [
    ...KERNEL_TOUCH_BINDINGS,
    ...entriesOf(TOUCH_BINDING_REGISTRY),
    ...registeredToolSlotRows().map(touchRuleOf),
  ]
}

/**
 * The rows whose tile the touch controls draw now: one per tile, the first by id, while any row
 * the tile serves is exposed to the player. Each tile still decides what it shows itself.
 */
export function shownTouchTileRowsOf(state: AuthorityState, playerId: string): TouchBindingRow[] {
  const exposed = entriesOf(TOUCH_BINDING_REGISTRY).filter((row) =>
    isTouchAnchorExposed(state, playerId, row.anchor),
  )
  return firstRowOfEachTile(exposed)
}

/** A tool slot as a binding row: the bar draws its cell, so it carries no tile. */
function touchRuleOf({ id, anchor, touch, contexts, reason }: TouchBindingRule): TouchBindingRow {
  return { id, anchor, touch, contexts, reason }
}

function firstRowOfEachTile(rows: readonly TouchBindingRow[]): TouchBindingRow[] {
  const drawn = new Set<ComponentType>()
  return rows.filter((row) => {
    if (row.Tile === undefined || drawn.has(row.Tile)) return false
    drawn.add(row.Tile)
    return true
  })
}

function sealProblemOf(registrations: readonly SealedRegistration<TouchBindingRow>[]) {
  const problems = registrations.flatMap(({ entry }) => registeredRowProblemsOf(entry))
  return problems.length === 0 ? null : problems.join('; ')
}

function registeredRowProblemsOf(row: TouchBindingRow): string[] {
  return [
    ...touchBindingProblemsOf(row, ACTION_MAP),
    ...sliceRowProblemsOf(row),
    ...(row.Tile === undefined ? undrawnRowProblemsOf(row, KERNEL_TOUCH_BINDINGS) : []),
  ]
}
