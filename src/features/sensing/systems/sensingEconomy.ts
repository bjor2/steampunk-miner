/**
 * The sensing lane's numbers from `sensing.economy.json` (spec #162 section 4, locked): the one-off
 * price of the charged items and passives and the consumables' unit price (4.1), each charged
 * item's row (4.2), each consumable's row (4.3) and each passive's base magnitude (4.4, set by
 * Content on 7 Oct for gap S3 of the #157 review). The file is refused whole on any problem, like
 * the kernel's economy file, so a stand-in never reaches a formula.
 */
import {
  createFieldReader,
  readBandOreCost,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import SENSING_ECONOMY_FILE from '../sensing.economy.json'

/** One charged item's Mark 1 numbers, in whole ticks and tiles. */
export interface ChargedSensingBalance {
  /** Charges per dock. */
  charges: number
  cooldownTicks: number
  windupTicks: number
  /** The ping's radius; null for the void sounder, which maps one whole cavern. */
  radiusTiles: number | null
  /** How long what it reveals stays shown: the stat the Mark magnitude step grows. */
  revealTicks: number
}

/** One consumable's Mark 1 numbers. */
export interface ConsumableSensingBalance {
  /** Crates carried on the rack. */
  stack: number
  windupTicks: number
  /** How far the flare mortar lobs its shell; null for the buoy, dropped where it stands. */
  rangeTiles: number | null
  /** The mapped or re-pinged ring: the stat the Mark magnitude step grows. */
  radiusTiles: number
}

/** What a passive's magnitude measures: a ring around the miner, or cells ahead of the drill. */
export type PassiveReach = 'radius' | 'lookahead'

/** One passive's Mark 1 magnitude (#162 4.4), the only stat its Marks grow (4.6). */
export interface PassiveSensingBalance {
  reach: PassiveReach
  /** Whole tiles for a radius, whole cells for a lookahead. */
  magnitude: number
}

export interface SensingEconomy {
  /** `k` band-5 ore units, paid at the item's unlock planet (#162 4.1). */
  price: BandOreCost
  /** `k` band-5 ore units per consumable, paid at the planet it is restocked on (#162 4.1). */
  unitPrice: BandOreCost
  charged: Readonly<Record<string, ChargedSensingBalance>>
  consumable: Readonly<Record<string, ConsumableSensingBalance>>
  passive: Readonly<Record<string, PassiveSensingBalance>>
}

export const SENSING_ECONOMY: SensingEconomy = loadSensingEconomy(SENSING_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readSensingEconomy(
  raw: unknown,
): { economy: SensingEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const items = reader.object('items', reader.object('file', raw).items)
  const economy = {
    price: readBandOreCost(reader, 'items.price', items.price),
    unitPrice: readBandOreCost(reader, 'items.unitPrice', items.unitPrice),
    charged: readRows(reader, 'items.charged', items.charged, readChargedRow),
    consumable: readRows(reader, 'items.consumable', items.consumable, readConsumableRow),
    passive: readRows(reader, 'items.passive', items.passive, readPassiveRow),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadSensingEconomy(raw: unknown): SensingEconomy {
  const reading = readSensingEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`sensing.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}

function readRows<Row>(
  reader: FieldReader,
  path: string,
  raw: unknown,
  readRow: (reader: FieldReader, path: string, raw: unknown) => Row,
): Readonly<Record<string, Row>> {
  const rows = reader.object(path, raw)
  return Object.fromEntries(
    Object.entries(rows).map(([itemId, row]) => [
      itemId,
      readRow(reader, `${path}.${itemId}`, row),
    ]),
  )
}

function readChargedRow(reader: FieldReader, path: string, raw: unknown): ChargedSensingBalance {
  const row = reader.object(path, raw)
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    cooldownTicks: reader.safeInteger(`${path}.cooldownTicks`, row.cooldownTicks),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, row.windupTicks),
    radiusTiles: readOptionalInteger(reader, `${path}.radiusTiles`, row.radiusTiles),
    revealTicks: reader.safeInteger(`${path}.revealTicks`, row.revealTicks),
  }
}

function readConsumableRow(
  reader: FieldReader,
  path: string,
  raw: unknown,
): ConsumableSensingBalance {
  const row = reader.object(path, raw)
  return {
    stack: reader.safeInteger(`${path}.stack`, row.stack),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, row.windupTicks),
    rangeTiles: readOptionalInteger(reader, `${path}.rangeTiles`, row.rangeTiles),
    radiusTiles: reader.safeInteger(`${path}.radiusTiles`, row.radiusTiles),
  }
}

/** A passive names exactly one of `radiusTiles` (a ring) and `lookaheadCells` (ahead of the bit). */
function readPassiveRow(reader: FieldReader, path: string, raw: unknown): PassiveSensingBalance {
  const row = reader.object(path, raw)
  const radius = readOptionalInteger(reader, `${path}.radiusTiles`, row.radiusTiles)
  const lookahead = readOptionalInteger(reader, `${path}.lookaheadCells`, row.lookaheadCells)
  if ((radius === null) === (lookahead === null)) {
    reader.record(`${path} must name exactly one of radiusTiles and lookaheadCells`)
  }
  return radius !== null
    ? { reach: 'radius', magnitude: radius }
    : { reach: 'lookahead', magnitude: lookahead ?? 0 }
}

/** A field an item may leave out: null when absent, a safe integer when present. */
function readOptionalInteger(reader: FieldReader, path: string, value: unknown): number | null {
  return value === undefined ? null : reader.safeInteger(path, value)
}
