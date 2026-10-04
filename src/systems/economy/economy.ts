/**
 * The economy every formula reads: `economy.json`, read once and refused whole if it is broken,
 * so a bad edit fails at load with every problem listed instead of mispricing a run.
 */
import economyFile from './economy.json'
import type { Economy } from './economyDefinition'
import { readEconomy } from './readEconomy'

export const ECONOMY: Economy = loadEconomy(economyFile)

function loadEconomy(raw: unknown): Economy {
  const reading = readEconomy(raw)
  if ('economy' in reading) return reading.economy
  throw new Error(`economy.json is refused:\n${reading.problems.join('\n')}`)
}
