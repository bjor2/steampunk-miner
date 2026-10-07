/**
 * The extraction lane's numbers from `extraction.economy.json` (spec #162 section 4, locked): the
 * one-off price every item here pays (4.1) and each item's `items.balance.<id>` row (4.2). The
 * file is refused whole on any problem, like the kernel's economy file, so a stand-in never
 * reaches a formula.
 */
import {
  createFieldReader,
  readBandOreCost,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import EXTRACTION_ECONOMY_FILE from '../extraction.economy.json'

/** One item's Mark 1 numbers, in whole ticks, tiles and cells. */
export interface ExtractionBalance {
  /** Charges per dock. */
  charges: number
  cooldownTicks: number
  /** The drain's channel hold, or the siphon's wind-up: the ticks from the press to the act. */
  actTicks: number
  /** The drain's radius, or the siphon's line length. */
  reachTiles: number
  /** At most this many cells drained by one use: the stat the Mark magnitude step grows. */
  cellsPerUse: number
}

export interface ExtractionEconomy {
  /** `k` band-5 ore units, paid at the item's unlock planet (#162 4.1). */
  price: BandOreCost
  balance: Readonly<Record<string, ExtractionBalance>>
}

export const EXTRACTION_ECONOMY: ExtractionEconomy = loadExtractionEconomy(EXTRACTION_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readExtractionEconomy(
  raw: unknown,
): { economy: ExtractionEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const items = reader.object('items', reader.object('file', raw).items)
  const economy = {
    price: readBandOreCost(reader, 'items.price', items.price),
    balance: readBalanceRows(reader, items.balance),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadExtractionEconomy(raw: unknown): ExtractionEconomy {
  const reading = readExtractionEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`extraction.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}

function readBalanceRows(reader: FieldReader, raw: unknown): ExtractionEconomy['balance'] {
  const rows = reader.object('items.balance', raw)
  return Object.fromEntries(
    Object.entries(rows).map(([itemId, row]) => [
      itemId,
      readBalance(reader, `items.balance.${itemId}`, row),
    ]),
  )
}

function readBalance(reader: FieldReader, path: string, raw: unknown): ExtractionBalance {
  const row = reader.object(path, raw)
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    cooldownTicks: reader.safeInteger(`${path}.cooldownTicks`, row.cooldownTicks),
    actTicks: reader.safeInteger(`${path}.actTicks`, row.actTicks),
    reachTiles: reader.safeInteger(`${path}.reachTiles`, row.reachTiles),
    cellsPerUse: reader.safeInteger(`${path}.cellsPerUse`, row.cellsPerUse),
  }
}
