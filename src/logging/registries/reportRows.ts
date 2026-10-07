/**
 * Rows a slice adds to the run reports (#223, TD lock on #146): a source is a pure function from a
 * run's events, its world seed and one planet to the rows it reads off them. The balance report
 * prints them per pacing seed and the session report per run log (`reportRows.ts`); nothing
 * writes them into the log, since derived data stays derived (#11 section 3). A row never reports
 * a feature unlock: unlocks stay with stats.json and `feature_unlocked` (Horizontal Scaler).
 */
import { defineRegistry, entriesOf } from '../../systems/registries/seal'
import type { RunEvent } from '../runEvent'

export interface ReportRow {
  label: string
  value: string
}

export interface ReportRowSource {
  /** `<slice>.<name>`. */
  id: string
  /** `events` in log order; `planet` is one the run entered. */
  rowsOf(events: readonly RunEvent[], worldSeed: number, planet: number): readonly ReportRow[]
}

export const REPORT_ROW_REGISTRY = defineRegistry<ReportRowSource>('reportRows')

/** Every registered source, sorted by id. */
export function reportRowSources(): readonly ReportRowSource[] {
  return entriesOf(REPORT_ROW_REGISTRY)
}
