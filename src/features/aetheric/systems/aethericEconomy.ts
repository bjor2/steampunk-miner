/**
 * The aetheric lane's numbers from `aetheric.economy.json`, under `tech.aetheric` (the GD lock on
 * #245: range, duration, chain count, condense ratio and cooldowns live there, never in code): the
 * one-off price every item pays (#162 4.1) and the resonance whistle's row (#262). The file is
 * refused whole on any problem, like the kernel's economy file, so a stand-in never reaches a rule.
 */
import {
  createFieldReader,
  readBandOreCost,
  type FieldReader,
} from '../../../systems/economy/economyFieldReader'
import type { BandOreCost } from '../../../systems/economy/economyDefinition'
import AETHERIC_ECONOMY_FILE from '../aetheric.economy.json'

/** The whistle's Mark 1 numbers, in whole ticks, tiles and energy quanta (1/240 unit). */
export interface WhistleBalance {
  /** Charges per dock. */
  charges: number
  cooldownTicks: number
  windupTicks: number
  /** How far from the whistle's cell, in whole tiles, a hunter hears it. */
  reachTiles: number
  /** How long the lure lasts: the stat the Mark magnitude step grows. */
  durationTicks: number
  /** What one blow takes from the tank. */
  energyQuanta: number
}

export interface AethericEconomy {
  /** `k` band-5 ore units, paid at the item's unlock planet (#162 4.1). */
  price: BandOreCost
  resonanceWhistle: WhistleBalance
}

export const AETHERIC_ECONOMY: AethericEconomy = loadAethericEconomy(AETHERIC_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readAethericEconomy(
  raw: unknown,
): { economy: AethericEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const tech = reader.object('tech', reader.object('file', raw).tech)
  const lane = reader.object('tech.aetheric', tech.aetheric)
  const economy = {
    price: readBandOreCost(reader, 'tech.aetheric.price', lane.price),
    resonanceWhistle: readWhistle(reader, 'tech.aetheric.resonanceWhistle', lane.resonanceWhistle),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadAethericEconomy(raw: unknown): AethericEconomy {
  const reading = readAethericEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`aetheric.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}

function readWhistle(reader: FieldReader, path: string, raw: unknown): WhistleBalance {
  const row = reader.object(path, raw)
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    cooldownTicks: reader.safeInteger(`${path}.cooldownTicks`, row.cooldownTicks),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, row.windupTicks),
    reachTiles: reader.safeInteger(`${path}.reachTiles`, row.reachTiles),
    durationTicks: reader.safeInteger(`${path}.durationTicks`, row.durationTicks),
    energyQuanta: reader.safeInteger(`${path}.energyQuanta`, row.energyQuanta),
  }
}
