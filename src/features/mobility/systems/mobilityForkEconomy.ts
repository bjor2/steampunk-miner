/**
 * The mobility fork's numbers from the `forks` block of `mobility.economy.json` (the GD lock on
 * #255, ticket 268; the block's `source` gives each reading). Refused whole on any problem, like
 * the lane's own block, so a stand-in never reaches a rule.
 */
import { createFieldReader, type FieldReader } from '../../../systems/economy/economyFieldReader'
import MOBILITY_ECONOMY_FILE from '../mobility.economy.json'

export interface AgileNumbers {
  /** Lift and drive added while off the ground; the kernel caps the sum at +2000 bp. */
  airBoostBp: number
}

export interface ArmouredNumbers {
  /** The share of an enemy hit or a collapse's crush landing on a grounded miner. */
  groundedDamageScaleBp: number
  /** How much longer a raised steam curtain stands, once the shields row is open. */
  curtainExtraTicks: number
}

export interface MobilityForkNumbers {
  agile: AgileNumbers
  armoured: ArmouredNumbers
}

export const MOBILITY_FORK_NUMBERS: MobilityForkNumbers = loadForkNumbers(MOBILITY_ECONOMY_FILE)

/** Every problem with the `forks` block, or its numbers when it has none. */
export function readMobilityForkNumbers(
  raw: unknown,
): { numbers: MobilityForkNumbers } | { problems: string[] } {
  const reader = createFieldReader()
  const block = reader.object('forks', reader.object('file', raw).forks)
  const agile = reader.object('forks.agile', block.agile)
  const armoured = reader.object('forks.armoured', block.armoured)
  const numbers = {
    agile: { airBoostBp: wholeOf(reader, 'forks.agile.airBoostBp', agile.airBoostBp) },
    armoured: {
      groundedDamageScaleBp: wholeOf(
        reader,
        'forks.armoured.groundedDamageScaleBp',
        armoured.groundedDamageScaleBp,
      ),
      curtainExtraTicks: wholeOf(
        reader,
        'forks.armoured.curtainExtraTicks',
        armoured.curtainExtraTicks,
      ),
    },
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { numbers }
}

function loadForkNumbers(raw: unknown): MobilityForkNumbers {
  const reading = readMobilityForkNumbers(raw)
  if ('problems' in reading) {
    throw new Error(`mobility.economy.json forks are refused:\n${reading.problems.join('\n')}`)
  }
  return reading.numbers
}

function wholeOf(reader: FieldReader, path: string, value: unknown): number {
  const number = reader.safeInteger(path, value)
  if (number < 0) reader.record(`${path} must be a whole number from 0`)
  return number
}
