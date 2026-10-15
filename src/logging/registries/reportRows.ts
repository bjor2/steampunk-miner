/**
 * Rows a slice adds to the run reports (#223, TD lock on #146): a source is a pure function from a
 * run's events, its world seed and one planet to the rows it reads off them. The balance report
 * prints them per pacing seed and the session report per run log (`reportRows.ts`); nothing
 * writes them into the log, since derived data stays derived (#11 section 3). A row never reports
 * a feature unlock: unlocks stay with stats.json and `feature_unlocked` (Horizontal Scaler).
 */
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { defineRegistry, entriesOf } from '../../systems/registries/seal'
import type { RunEvent } from '../runEvent'

export interface ReportRow {
  label: string
  value: string
}

export interface ReportRowSource {
  /** `<slice>.<name>`. */
  id: string
  /**
   * `events` in log order; `planet` is one the run entered. `planetEvents` are the domain events
   * logged on `planet` when the run kept them (a bot run's, ticket 420), else none or left out:
   * what a row reading every unit reads, since the log folds a drill span's units into one line.
   */
  rowsOf(
    events: readonly RunEvent[],
    worldSeed: number,
    planet: number,
    planetEvents?: readonly DomainEvent[],
  ): readonly ReportRow[]
}

export const REPORT_ROW_REGISTRY = defineRegistry<ReportRowSource>('reportRows')

/** Every registered source, sorted by id. */
export function reportRowSources(): readonly ReportRowSource[] {
  return entriesOf(REPORT_ROW_REGISTRY)
}
