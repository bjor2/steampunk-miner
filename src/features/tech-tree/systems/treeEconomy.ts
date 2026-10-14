/**
 * The tree's numbers from `tech-tree.economy.json` (spec #161 section 3, the Systems absorber
 * amendment and #162 section 4.6): node cost coefficients, the Mark absorber steps, and the
 * cadence of Marks, generated combos and the discovery grace. The file is refused whole on any
 * problem, like the kernel's economy file, so a stand-in never reaches a formula.
 */
import { createFieldReader, type FieldReader } from '../../../systems/economy/economyFieldReader'
import type { Money } from '../../../systems/money'
import TREE_ECONOMY_FILE from '../tech-tree.economy.json'

export interface TreeCosts {
  /** The ore band a node is priced in. */
  band: number
  kCapability: Money
  kSlot: Money
  kCombo: Money
  kMark: Money
  /** The cost ratio per step of depth. */
  g: Money
  /** A Mark's depth stops growing here; past it the price grows only with the ore value. */
  markDepthCap: number
  /**
   * `b_lane`, the branch knob, by `laneBiasKeyOf` (an armoury lane by its weapon, `bore_gun`): 1 for
   * a lane not listed.
   */
  laneBias: Readonly<Record<string, Money>>
}

/** Floor and cap of the Mark rotation, as fractions of the item's Mark 1 value. */
export interface AbsorbLimits {
  cooldownFloor: Money
  durationCap: Money
}

export interface MarkAbsorb extends AbsorbLimits {
  cooldownStep: Money
  durationStep: Money
  /** Charges (or stack) a ladder may add over the item's own. */
  chargesCap: number
  /** The tighter limits of an ore-moving item. */
  income: AbsorbLimits
}

export interface TreeCadence {
  /** `M`: planets between an item's Marks. */
  markEvery: number
  /** The first planet a combo is generated on. */
  firstGeneratedCombo: number
  /** `K`: planets between generated combos. */
  comboEvery: number
  /** Planets an undiscovered node waits past its tier. */
  discoveryGrace: number
}

/** The nodes-only spend share the #165 diagnostic watches: reported, never failed on. */
export interface NodeShareWatch {
  firstPlanet: number
  lastPlanet: number
  share: Money
}

/**
 * One band of the #212 spend guard: the tree's share of a planet's spend, from `fromPlanet` until
 * the next band's planet.
 */
export interface SpendGuardBand {
  fromPlanet: number
  minShare: Money
  maxShare: Money
}

export interface TreeEconomy {
  costs: TreeCosts
  markAbsorb: MarkAbsorb
  cadence: TreeCadence
  /** By `fromPlanet`, ascending; a planet before the first band is not judged. */
  spendGuard: readonly SpendGuardBand[]
  nodeShareWatch: NodeShareWatch
}

export const TREE_ECONOMY: TreeEconomy = loadTreeEconomy(TREE_ECONOMY_FILE)

/** Every problem with the file, or the numbers when it has none. */
export function readTreeEconomy(raw: unknown): { economy: TreeEconomy } | { problems: string[] } {
  const reader = createFieldReader()
  const tech = reader.object('tech', reader.object('file', raw).tech)
  const economy = {
    costs: readCosts(reader, tech.costs),
    markAbsorb: readMarkAbsorb(reader, tech.markAbsorb),
    cadence: readCadence(reader, tech.cadence),
    spendGuard: readSpendGuard(reader, tech.spendGuard),
    nodeShareWatch: readNodeShareWatch(reader, tech.nodeShareWatch),
  }
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy }
}

function loadTreeEconomy(raw: unknown): TreeEconomy {
  const reading = readTreeEconomy(raw)
  if ('problems' in reading) {
    throw new Error(`tech-tree.economy.json is refused:\n${reading.problems.join('\n')}`)
  }
  return reading.economy
}

function readCosts(reader: FieldReader, raw: unknown): TreeCosts {
  const costs = reader.object('tech.costs', raw)
  return {
    band: reader.safeInteger('tech.costs.band', costs.band),
    kCapability: reader.money('tech.costs.kCapability', costs.kCapability),
    kSlot: reader.money('tech.costs.kSlot', costs.kSlot),
    kCombo: reader.money('tech.costs.kCombo', costs.kCombo),
    kMark: reader.money('tech.costs.kMark', costs.kMark),
    g: reader.money('tech.costs.g', costs.g),
    markDepthCap: reader.safeInteger('tech.costs.markDepthCap', costs.markDepthCap),
    laneBias: readLaneBias(reader, costs.laneBias),
  }
}

function readLaneBias(reader: FieldReader, raw: unknown): TreeCosts['laneBias'] {
  const bias = reader.object('tech.costs.laneBias', raw)
  return Object.fromEntries(
    Object.entries(bias).map(([lane, value]) => [
      lane,
      reader.money(`tech.costs.laneBias.${lane}`, value),
    ]),
  )
}

function readMarkAbsorb(reader: FieldReader, raw: unknown): MarkAbsorb {
  const absorb = reader.object('tech.markAbsorb', raw)
  return {
    cooldownStep: reader.money('tech.markAbsorb.cooldownStep', absorb.cooldownStep),
    cooldownFloor: reader.money('tech.markAbsorb.cooldownFloor', absorb.cooldownFloor),
    chargesCap: reader.safeInteger('tech.markAbsorb.chargesCap', absorb.chargesCap),
    durationStep: reader.money('tech.markAbsorb.durationStep', absorb.durationStep),
    durationCap: reader.money('tech.markAbsorb.durationCap', absorb.durationCap),
    income: readIncomeLimits(reader, absorb.income),
  }
}

function readIncomeLimits(reader: FieldReader, raw: unknown): AbsorbLimits {
  const income = reader.object('tech.markAbsorb.income', raw)
  return {
    cooldownFloor: reader.money('tech.markAbsorb.income.cooldownFloor', income.cooldownFloor),
    durationCap: reader.money('tech.markAbsorb.income.durationCap', income.durationCap),
  }
}

function readCadence(reader: FieldReader, raw: unknown): TreeCadence {
  const cadence = reader.object('tech.cadence', raw)
  return {
    markEvery: reader.safeInteger('tech.cadence.markEvery', cadence.markEvery),
    firstGeneratedCombo: reader.safeInteger(
      'tech.cadence.firstGeneratedCombo',
      cadence.firstGeneratedCombo,
    ),
    comboEvery: reader.safeInteger('tech.cadence.comboEvery', cadence.comboEvery),
    discoveryGrace: reader.safeInteger('tech.cadence.discoveryGrace', cadence.discoveryGrace),
  }
}

function readSpendGuard(reader: FieldReader, raw: unknown): SpendGuardBand[] {
  const guard = reader.object('tech.spendGuard', raw)
  const bands = reader
    .list('tech.spendGuard.bands', guard.bands)
    .map((band, index) => readSpendGuardBand(reader, `tech.spendGuard.bands[${index}]`, band))
  if (!isAscendingByPlanet(bands)) {
    reader.record('tech.spendGuard.bands must ascend by fromPlanet')
  }
  return bands
}

function readSpendGuardBand(reader: FieldReader, path: string, raw: unknown): SpendGuardBand {
  const band = reader.object(path, raw)
  return {
    fromPlanet: reader.safeInteger(`${path}.fromPlanet`, band.fromPlanet),
    minShare: reader.money(`${path}.minShare`, band.minShare),
    maxShare: reader.money(`${path}.maxShare`, band.maxShare),
  }
}

function isAscendingByPlanet(bands: readonly SpendGuardBand[]): boolean {
  return bands.every((band, index) => index === 0 || band.fromPlanet > bands[index - 1].fromPlanet)
}

function readNodeShareWatch(reader: FieldReader, raw: unknown): NodeShareWatch {
  const watch = reader.object('tech.nodeShareWatch', raw)
  return {
    firstPlanet: reader.safeInteger('tech.nodeShareWatch.firstPlanet', watch.firstPlanet),
    lastPlanet: reader.safeInteger('tech.nodeShareWatch.lastPlanet', watch.lastPlanet),
    share: reader.money('tech.nodeShareWatch.share', watch.share),
  }
}
