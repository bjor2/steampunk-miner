/**
 * The power-up core slice's numbers from `power-up-core.economy.json`: the cradle price (#162 4.1,
 * the Systems note on #200) and the strength a sibling-link fires its sibling at (the GD lock on
 * #256). Refused whole on any problem, like the kernel's economy file.
 */
import { createFieldReader, readBandOreCost } from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import POWER_UP_CORE_ECONOMY_FILE from '../power-up-core.economy.json'

export interface PowerUpCoreEconomy {
  /** Each cradle at its unlock planet: 20 band-5 units. */
  cradlePrice: BandOreCost
  /** A linked sibling's magnitude, in basis points of its own: half (#256 worked examples). */
  siblingLinkStrengthBp: number
}

export const POWER_UP_CORE_ECONOMY: PowerUpCoreEconomy = loadPowerUpCoreEconomy(
  POWER_UP_CORE_ECONOMY_FILE,
)

/** Every problem with the file, or the numbers when it has none. */
export function readPowerUpCoreEconomy(
  raw: unknown,
): { economy: PowerUpCoreEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const block = reader.object('powerUpCore', reader.object('file', raw).powerUpCore)
  const economy = {
    cradlePrice: readBandOreCost(reader, 'powerUpCore.cradlePrice', block.cradlePrice),
    siblingLinkStrengthBp: reader.safeInteger(
      'powerUpCore.siblingLinkStrengthBp',
      block.siblingLinkStrengthBp,
    ),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadPowerUpCoreEconomy(raw: unknown): PowerUpCoreEconomy {
  const reading = readPowerUpCoreEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`power-up-core.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}
