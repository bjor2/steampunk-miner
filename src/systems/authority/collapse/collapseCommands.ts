/** Collapse's `debug.*` command intent (#43), built in one place for the store, the API and specs. */
import type { CommandIntent } from '../authorityCommand'

/** `block` is `cx,cy#index`, as `collapseState()` and the log name blocks. */
export function forceCollapseCommand(block: string): CommandIntent<'debug.forceCollapse'> {
  return { type: 'debug.forceCollapse', payload: { block } }
}
