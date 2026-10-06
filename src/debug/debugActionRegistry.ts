/**
 * Slice debug actions (docs/standards/feature-slices.md 3.14), exposed as
 * `window.steampunkDebug.features['<slice>'].<action>()`, so a slice never adds a `DebugApi` key.
 * A state-changing action submits a `debug.<slice>.<action>` command through
 * `submitSliceDebugCommand` (`sliceDebugCommands.ts`), so it replays and logs
 * `debug_command_applied`; it never writes state itself.
 */
import { defineRegistry, entriesOf } from '../systems/registries/seal'
import type { DebugResult } from './debugScreens'

export type DebugAction = (...args: readonly unknown[]) => DebugResult

export type SliceDebugActions = Readonly<Record<string, DebugAction>>

/** One slice's actions, filed under the slice id. */
export interface SliceDebugActionSet {
  id: string
  actions: SliceDebugActions
}

export const DEBUG_ACTION_REGISTRY = defineRegistry<SliceDebugActionSet>('debugActions')

export function debugActionsBySlice(): Readonly<Record<string, SliceDebugActions>> {
  return Object.fromEntries(
    entriesOf(DEBUG_ACTION_REGISTRY).map(({ id, actions }) => [id, actions]),
  )
}
