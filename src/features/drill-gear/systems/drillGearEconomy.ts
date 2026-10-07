/**
 * The drill-gear lane's numbers from `drill-gear.economy.json` (spec #162 section 4, locked): the
 * one-off price every item here pays (4.1), each item's `items.balance.<id>` row (4.2, 4.4) and
 * the Vertical Scaler's drill-path caps from the #205 GD lock (side cells cost at least the main
 * drill's energy, the bit reaches at most one cell further). The file is refused whole on any
 * problem, like the kernel's economy file, so a stand-in never reaches a formula.
 */
import {
  createFieldReader,
  readBandOreCost,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import DRILL_GEAR_ECONOMY_FILE from '../drill-gear.economy.json'

/** Every stat a drill-gear row may carry, each a whole number in the unit its name gives. */
export const DRILL_GEAR_STAT_NAMES = [
  'charges',
  'cooldownTicks',
  'windUpTicks',
  'reachTiles',
  'crumbleAheadCells',
  'crumbleHardnessBp',
  'drawBpPerSecond',
  'fillBehindM',
  'vehicleClearanceM',
  'sideCells',
  'sideEnergyShareBp',
  'aheadCells',
] as const

export type DrillGearStatName = (typeof DRILL_GEAR_STAT_NAMES)[number]

/** One item's Mark 1 numbers; an item lists only the stats it has (a head may have none yet). */
export type DrillGearBalance = Readonly<Partial<Record<DrillGearStatName, number>>>

/** The Vertical Scaler's caps on the per-player drill-path read (#205 GD lock, 7 Oct). */
export interface DrillPathCaps {
  /** A side cell costs at least this share of the main drill's energy for it: reach, not free throughput. */
  sideEnergyShareBpMin: number
  /** The bit reaches at most this many cells further ahead until the drill-track curve is re-derived. */
  aheadCellsMax: number
}

export interface DrillGearEconomy {
  /** `k` band-5 ore units, paid at the item's unlock planet (#162 4.1). */
  price: BandOreCost
  drillPathCaps: DrillPathCaps
  balance: Readonly<Record<string, DrillGearBalance>>
}

export const DRILL_GEAR_ECONOMY: DrillGearEconomy = loadDrillGearEconomy(DRILL_GEAR_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readDrillGearEconomy(
  raw: unknown,
): { economy: DrillGearEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const items = reader.object('items', reader.object('file', raw).items)
  const economy = {
    price: readBandOreCost(reader, 'items.price', items.price),
    drillPathCaps: readDrillPathCaps(reader, items.drillPathCaps),
    balance: readBalanceRows(reader, items.balance),
  }
  recordCapBreaches(reader, economy)
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadDrillGearEconomy(raw: unknown): DrillGearEconomy {
  const reading = readDrillGearEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`drill-gear.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}

function readDrillPathCaps(reader: FieldReader, raw: unknown): DrillPathCaps {
  const caps = reader.object('items.drillPathCaps', raw)
  return {
    sideEnergyShareBpMin: reader.safeInteger(
      'items.drillPathCaps.sideEnergyShareBpMin',
      caps.sideEnergyShareBpMin,
    ),
    aheadCellsMax: reader.safeInteger('items.drillPathCaps.aheadCellsMax', caps.aheadCellsMax),
  }
}

function readBalanceRows(reader: FieldReader, raw: unknown): DrillGearEconomy['balance'] {
  const rows = reader.object('items.balance', raw)
  return Object.fromEntries(
    Object.entries(rows).map(([itemId, row]) => [
      itemId,
      readBalance(reader, `items.balance.${itemId}`, row),
    ]),
  )
}

function readBalance(reader: FieldReader, path: string, raw: unknown): DrillGearBalance {
  const row = reader.object(path, raw)
  return Object.fromEntries(
    Object.entries(row).map(([stat, value]) => [stat, readStat(reader, path, stat, value)]),
  )
}

function readStat(reader: FieldReader, rowPath: string, stat: string, value: unknown): number {
  if (!isDrillGearStatName(stat)) reader.record(`${rowPath}.${stat} is not a drill-gear stat`)
  return reader.safeInteger(`${rowPath}.${stat}`, value)
}

function isDrillGearStatName(stat: string): stat is DrillGearStatName {
  return (DRILL_GEAR_STAT_NAMES as readonly string[]).includes(stat)
}

/** A row past the drill-path caps is a broken file, never a clamped one. */
function recordCapBreaches(reader: FieldReader, economy: DrillGearEconomy): void {
  for (const [itemId, row] of Object.entries(economy.balance)) {
    for (const problem of capBreachesOf(row, economy.drillPathCaps)) {
      reader.record(`items.balance.${itemId}.${problem}`)
    }
  }
}

function capBreachesOf(row: DrillGearBalance, caps: DrillPathCaps): string[] {
  return [
    ...(isSideCellUnderpriced(row, caps)
      ? [`sideEnergyShareBp must be >= ${caps.sideEnergyShareBpMin}`]
      : []),
    ...(isReachPastCap(row, caps) ? [`aheadCells must be <= ${caps.aheadCellsMax}`] : []),
  ]
}

function isSideCellUnderpriced(row: DrillGearBalance, caps: DrillPathCaps): boolean {
  return (row.sideEnergyShareBp ?? caps.sideEnergyShareBpMin) < caps.sideEnergyShareBpMin
}

function isReachPastCap(row: DrillGearBalance, caps: DrillPathCaps): boolean {
  return (row.aheadCells ?? 0) > caps.aheadCellsMax
}
