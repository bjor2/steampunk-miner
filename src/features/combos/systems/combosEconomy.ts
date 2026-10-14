/**
 * The combos slice's numbers from `combos.economy.json`: the one-off price every combo pays at its
 * unlock planet (spec #162 section 4.1, locked), and the share of the remaining headroom each grade
 * closes (GD lock on #206, decision 7). The file is refused whole on any problem, like the kernel's
 * economy file, so a stand-in never reaches a formula.
 */
import {
  createFieldReader,
  readBandOreCost,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import COMBOS_ECONOMY_FILE from '../combos.economy.json'

export interface CombosEconomy {
  /** `k` band-5 ore units, paid at the combo's unlock planet (#162 4.1). */
  price: BandOreCost
  grades: ComboGrades
}

export interface ComboGrades {
  /** The share of what is left of a headroom that each grade closes, in bp (0 to 10000). */
  headroomShareBp: number
}

const WHOLE_BP = 10_000

export const COMBOS_ECONOMY: CombosEconomy = loadCombosEconomy(COMBOS_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readCombosEconomy(
  raw: unknown,
): { economy: CombosEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const file = reader.object('file', raw)
  const items = reader.object('items', file.items)
  const economy = {
    price: readBandOreCost(reader, 'items.price', items.price),
    grades: readComboGrades(reader, file.grades),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function readComboGrades(reader: FieldReader, value: unknown): ComboGrades {
  const grades = reader.object('grades', value)
  const headroomShareBp = reader.safeInteger('grades.headroomShareBp', grades.headroomShareBp)
  if (headroomShareBp < 0 || headroomShareBp > WHOLE_BP) {
    reader.record('grades.headroomShareBp must be 0 to 10000')
  }
  return { headroomShareBp }
}

function loadCombosEconomy(raw: unknown): CombosEconomy {
  const reading = readCombosEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`combos.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}
