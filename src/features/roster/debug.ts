/**
 * Read-only debug actions (feature-slices.md 3.14), so `npm run rarity:shares` and probes can read
 * ticket 449's share table without the slice's internals:
 * `steampunkDebug.features.roster.shareTable()` reads every judged planet on every pacing seed
 * (a few seconds) with the on-curve #385 income cap beside it.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { currentShareTable } from './systems/shareTable'

function shareTable() {
  return { ok: true as const, table: currentShareTable() }
}

export const rosterDebugActions: Readonly<Record<string, DebugAction>> = { shareTable }
