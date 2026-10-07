/**
 * The combos slice's numbers from `combos.economy.json` (spec #162 section 4.1, locked): the
 * one-off price every combo pays at its unlock planet. The file is refused whole on any problem,
 * like the kernel's economy file, so a stand-in never reaches a formula.
 */
import { createFieldReader, readBandOreCost } from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import COMBOS_ECONOMY_FILE from '../combos.economy.json'

export interface CombosEconomy {
  /** `k` band-5 ore units, paid at the combo's unlock planet (#162 4.1). */
  price: BandOreCost
}

export const COMBOS_ECONOMY: CombosEconomy = loadCombosEconomy(COMBOS_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readCombosEconomy(
  raw: unknown,
): { economy: CombosEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const items = reader.object('items', reader.object('file', raw).items)
  const economy = { price: readBandOreCost(reader, 'items.price', items.price) }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadCombosEconomy(raw: unknown): CombosEconomy {
  const reading = readCombosEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`combos.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}
