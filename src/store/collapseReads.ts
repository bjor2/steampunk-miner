/**
 * Collapse as the authority replica holds it (#43), read without React: the debug API's unlogged
 * `collapseState()` report and, every frame, the blocks the scene telegraphs. Nothing is written.
 */
import { collapseReportOf, type CollapseReport } from '../systems/authority/collapse/collapseReport'
import type { CollapseState } from '../systems/authority/collapse/collapseState'
import { readAuthorityState } from './authorityLink'

export function readCollapseReport(): CollapseReport {
  return collapseReportOf(readAuthorityState())
}

/** The blocks warning or refilling and the authority's tick, for the scene's per-frame drawing. */
export function readCollapse(): { collapse: CollapseState; tick: number } {
  const state = readAuthorityState()
  return { collapse: state.collapse, tick: state.tick }
}
