/**
 * The terrain lane's numbers from `terrain-tools.economy.json` (spec #162 section 4, locked): the
 * one-off and per-unit prices (4.1) and each item's `items.balance.<id>` row (4.2 charged items,
 * 4.3 consumables), with the TD's terrain caps as the magnitude limits (4.6). The file is refused
 * whole on any problem, like the kernel's economy file, so a stand-in never reaches a formula.
 */
import {
  createFieldReader,
  readBandOreCost,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import TERRAIN_ECONOMY_FILE from '../terrain-tools.economy.json'

/** One item's Mark 1 numbers, in whole ticks, tiles, cells or swaps. */
export interface TerrainBalance {
  /** Charges per dock, or a consumable's stack. */
  charges: number
  /** Charged items only: consumables have no cooldown (#162 4.6). */
  cooldownTicks?: number
  windupTicks?: number
  /** The radius, cone or reach the item works within, where it has one apart from its size. */
  reachTiles?: number
  /** The size the Mark magnitude step grows, in the unit the catalogue row names. */
  magnitude: number
  /** The TD's terrain cap in the magnitude's own unit (32 density cells or 64 swaps). */
  magnitudeLimit?: number
  /** The lodestone's swaps per beacon (TD cap 256), whatever its radius. */
  swapCap?: number
}

export interface TerrainEconomy {
  /** `k` band-5 ore units for a charged item, paid at its unlock planet (#162 4.1). */
  oneOffPrice: BandOreCost
  /** `k` band-5 ore units per consumable unit, paid at the current planet (#162 4.1). */
  perUnitPrice: BandOreCost
  balance: Readonly<Record<string, TerrainBalance>>
}

export const TERRAIN_ECONOMY: TerrainEconomy = loadTerrainEconomy(TERRAIN_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readTerrainEconomy(
  raw: unknown,
): { economy: TerrainEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const items = reader.object('items', reader.object('file', raw).items)
  const price = reader.object('items.price', items.price)
  const economy = {
    oneOffPrice: readBandOreCost(reader, 'items.price.oneOff', price.oneOff),
    perUnitPrice: readBandOreCost(reader, 'items.price.perUnit', price.perUnit),
    balance: readBalanceRows(reader, items.balance),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadTerrainEconomy(raw: unknown): TerrainEconomy {
  const reading = readTerrainEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`terrain-tools.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}

function readBalanceRows(reader: FieldReader, raw: unknown): TerrainEconomy['balance'] {
  const rows = reader.object('items.balance', raw)
  return Object.fromEntries(
    Object.entries(rows).map(([itemId, row]) => [
      itemId,
      readBalance(reader, `items.balance.${itemId}`, row),
    ]),
  )
}

function readBalance(reader: FieldReader, path: string, raw: unknown): TerrainBalance {
  const row = reader.object(path, raw)
  const optional = (field: string) => readOptionalInteger(reader, `${path}.${field}`, row[field])
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    magnitude: reader.safeInteger(`${path}.magnitude`, row.magnitude),
    ...withDefined('cooldownTicks', optional('cooldownTicks')),
    ...withDefined('windupTicks', optional('windupTicks')),
    ...withDefined('reachTiles', optional('reachTiles')),
    ...withDefined('magnitudeLimit', optional('magnitudeLimit')),
    ...withDefined('swapCap', optional('swapCap')),
  }
}

/** An absent field stays absent; a present one must be a safe integer. */
function readOptionalInteger(reader: FieldReader, path: string, raw: unknown): number | undefined {
  return raw === undefined ? undefined : reader.safeInteger(path, raw)
}

function withDefined<K extends string>(key: K, value: number | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, number>)
}
