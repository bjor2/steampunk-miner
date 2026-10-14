/**
 * The aetheric lane's numbers from `aetheric.economy.json`, under `tech.aetheric` (the GD lock on
 * #245: range, duration, chain count, condense ratio and cooldowns live there, never in code): the
 * one-off price every item pays (#162 4.1), the resonance whistle's row (#262), the P16 fork pair's
 * rows, the phase lantern's and the galvanic arc coil's (#261), the chronometric governor's and the
 * aether condenser's rows and the off-act item heat gauge (#263). The file is refused whole on any
 * problem, like the kernel's economy file, so a stand-in never reaches a rule.
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

/**
 * The phase lantern's Mark 1 numbers (#261): the phase itself takes the ticks and the energy the
 * bit would need on the cell; these are what the lantern adds on top.
 */
export interface LanternBalance {
  /** Charges per dock. */
  charges: number
  cooldownTicks: number
  windupTicks: number
  /** What the lantern takes from the tank beyond the bit's energy for the cell's ticks. */
  energyQuanta: number
  /** What a phase adds to the item heat gauge. */
  heatUnits: number
}

/** The arc coil's Mark 1 numbers (#261), in whole ticks, tiles, energy quanta and heat units. */
export interface ArcCoilBalance {
  /** Charges per dock. */
  charges: number
  cooldownTicks: number
  windupTicks: number
  /** How far from the vehicle, in whole tiles, the bolt finds its first enemy: the Mark magnitude. */
  rangeTiles: number
  /** How far from the last enemy hit, in whole tiles, the bolt chains to the next. */
  chainTiles: number
  /** How many more enemies the bolt chains to after the first. */
  chainCount: number
  /** What one bolt takes from the tank. */
  energyQuanta: number
  /** What one bolt adds to the item heat gauge. */
  heatUnits: number
}

/** The governor's Mark 1 numbers, in whole ticks, tiles, energy quanta and heat units. */
export interface GovernorBalance {
  /** Charges per dock. */
  charges: number
  cooldownTicks: number
  windupTicks: number
  /** How far from the pocket's cell, in whole tiles, an enemy is slowed. */
  rangeTiles: number
  /** How long the pocket holds: the stat the Mark magnitude step grows. */
  durationTicks: number
  /** What each tick the pocket holds takes from the tank. */
  energyQuantaPerTick: number
  /** What opening a pocket adds to the item heat gauge (`HEAT_UNITS_PER_POINT` a point). */
  heatUnits: number
}

/** The condenser's Mark 1 numbers; its ratio is the kernel's (`src/data/aetheric.json`, #360). */
export interface CondenserBalance {
  /** Charges per dock. */
  charges: number
  cooldownTicks: number
  windupTicks: number
}

/** The off-act gauge that holds the heat items add (GD ruling on #263 Q1 a), in heat units. */
export interface ItemHeatBalance {
  gaugeMaxUnits: number
  coolingUnitsPerTick: number
}

export interface AethericEconomy {
  /** `k` band-5 ore units, paid at the item's unlock planet (#162 4.1). */
  price: BandOreCost
  resonanceWhistle: WhistleBalance
  phaseLantern: LanternBalance
  arcCoil: ArcCoilBalance
  chronometricGovernor: GovernorBalance
  aetherCondenser: CondenserBalance
  itemHeat: ItemHeatBalance
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
    phaseLantern: readLantern(reader, 'tech.aetheric.phaseLantern', lane.phaseLantern),
    arcCoil: readArcCoil(reader, 'tech.aetheric.arcCoil', lane.arcCoil),
    chronometricGovernor: readGovernor(
      reader,
      'tech.aetheric.chronometricGovernor',
      lane.chronometricGovernor,
    ),
    aetherCondenser: readCondenser(reader, 'tech.aetheric.aetherCondenser', lane.aetherCondenser),
    itemHeat: readItemHeat(reader, 'tech.aetheric.itemHeat', lane.itemHeat),
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

function readLantern(reader: FieldReader, path: string, raw: unknown): LanternBalance {
  const row = reader.object(path, raw)
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    cooldownTicks: reader.safeInteger(`${path}.cooldownTicks`, row.cooldownTicks),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, row.windupTicks),
    energyQuanta: reader.safeInteger(`${path}.energyQuanta`, row.energyQuanta),
    heatUnits: reader.safeInteger(`${path}.heatUnits`, row.heatUnits),
  }
}

function readArcCoil(reader: FieldReader, path: string, raw: unknown): ArcCoilBalance {
  const row = reader.object(path, raw)
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    cooldownTicks: reader.safeInteger(`${path}.cooldownTicks`, row.cooldownTicks),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, row.windupTicks),
    rangeTiles: reader.safeInteger(`${path}.rangeTiles`, row.rangeTiles),
    chainTiles: reader.safeInteger(`${path}.chainTiles`, row.chainTiles),
    chainCount: reader.safeInteger(`${path}.chainCount`, row.chainCount),
    energyQuanta: reader.safeInteger(`${path}.energyQuanta`, row.energyQuanta),
    heatUnits: reader.safeInteger(`${path}.heatUnits`, row.heatUnits),
  }
}

function readGovernor(reader: FieldReader, path: string, raw: unknown): GovernorBalance {
  const row = reader.object(path, raw)
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    cooldownTicks: reader.safeInteger(`${path}.cooldownTicks`, row.cooldownTicks),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, row.windupTicks),
    rangeTiles: reader.safeInteger(`${path}.rangeTiles`, row.rangeTiles),
    durationTicks: reader.safeInteger(`${path}.durationTicks`, row.durationTicks),
    energyQuantaPerTick: reader.safeInteger(`${path}.energyQuantaPerTick`, row.energyQuantaPerTick),
    heatUnits: reader.safeInteger(`${path}.heatUnits`, row.heatUnits),
  }
}

function readCondenser(reader: FieldReader, path: string, raw: unknown): CondenserBalance {
  const row = reader.object(path, raw)
  return {
    charges: reader.safeInteger(`${path}.charges`, row.charges),
    cooldownTicks: reader.safeInteger(`${path}.cooldownTicks`, row.cooldownTicks),
    windupTicks: reader.safeInteger(`${path}.windupTicks`, row.windupTicks),
  }
}

function readItemHeat(reader: FieldReader, path: string, raw: unknown): ItemHeatBalance {
  const row = reader.object(path, raw)
  return {
    gaugeMaxUnits: reader.safeInteger(`${path}.gaugeMaxUnits`, row.gaugeMaxUnits),
    coolingUnitsPerTick: reader.safeInteger(`${path}.coolingUnitsPerTick`, row.coolingUnitsPerTick),
  }
}
