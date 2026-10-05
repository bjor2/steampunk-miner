/**
 * `enemyStatsTable(kind)` for the debug API (#9, #14, #6 table D): one row per planet 1 to 40,
 * BigStats as canonical strings, so a Playwright or AI-driven test can read the balance it plays.
 */
import { enemyStatsTable, type EnemyStatsRow } from '../../economy/economyTables'
import type { EnemyKind } from '../../economy/economyDefinition'
import { toCanonical, type BigStat } from '../../money'

export interface EnemyStatsRowView {
  planetIndex: number
  tierByBand: readonly number[]
  healthByBand: string[]
  baseHitByBand: string[]
  killSecondsByBand: string[]
  sideHitShareByBand: string[]
  behindKillSecondsByBand: string[]
  behindSideHitShareByBand: string[]
}

/** The slice's planets plus the 38 after them that the #6 tables already cover. */
const TABLE_PLANETS = 40

export function enemyStatsTableView(kind: EnemyKind): EnemyStatsRowView[] {
  return enemyStatsTable(kind, TABLE_PLANETS).map(rowViewOf)
}

function rowViewOf(row: EnemyStatsRow): EnemyStatsRowView {
  return {
    planetIndex: row.planetIndex,
    tierByBand: row.tierByBand,
    healthByBand: canonicalList(row.healthByBand),
    baseHitByBand: canonicalList(row.baseHitByBand),
    killSecondsByBand: canonicalList(row.killSecondsByBand),
    sideHitShareByBand: canonicalList(row.sideHitShareByBand),
    behindKillSecondsByBand: canonicalList(row.behindKillSecondsByBand),
    behindSideHitShareByBand: canonicalList(row.behindSideHitShareByBand),
  }
}

function canonicalList(values: readonly BigStat[]): string[] {
  return values.map(toCanonical)
}
