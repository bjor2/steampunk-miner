/**
 * Reads the raw `economy.json` into an `Economy`. A broken file is refused whole and every
 * problem is listed, like a scenario (CLAUDE.md "refused, never trimmed").
 */
import { createFieldReader, readLiteral, readRange, type FieldReader } from './economyFieldReader'
import { readEnemies } from './readEnemyEconomy'
import {
  TRACK_EFFECTS,
  UPGRADE_IDS,
  type CostCurve,
  type Economy,
  type GeometricEffect,
  type LinearEffect,
  type SaturatingEffect,
  type UpgradeDef,
  type UpgradeEffect,
  type UpgradeId,
  type VisualTierThreshold,
} from './economyDefinition'
import type { Money } from '../money'

export type EconomyReading = { economy: Economy; problems: [] } | { problems: string[] }

export function readEconomy(raw: unknown): EconomyReading {
  const reader = createFieldReader()
  const economy = readEconomyFields(reader, reader.object('economy', raw))
  return reader.problems.length > 0 ? { problems: reader.problems } : { economy, problems: [] }
}

function readEconomyFields(reader: FieldReader, file: Record<string, unknown>): Economy {
  const costCurves = reader
    .list('costCurves', file.costCurves)
    .map((curve, index) => readCostCurve(reader, `costCurves[${index}]`, curve))
  const upgrades = reader
    .list('upgrades', file.upgrades)
    .map((upgrade, index) => readUpgrade(reader, `upgrades[${index}]`, upgrade))
  checkUpgradeSet(reader, upgrades, costCurves)
  return {
    economyVersion: reader.safeInteger('economyVersion', file.economyVersion),
    ore: readOre(reader, reader.object('ore', file.ore)),
    planets: readPlanets(reader, reader.object('planets', file.planets)),
    prices: readPrices(reader, reader.object('prices', file.prices)),
    energy: readEnergy(reader, reader.object('energy', file.energy)),
    drill: readDrill(reader, reader.object('drill', file.drill)),
    costCurves,
    casing: readCasing(reader, reader.object('casing', file.casing), costCurves),
    upgrades,
    visualTiers: reader
      .list('visualTiers', file.visualTiers)
      .map((tier, index) => readVisualTier(reader, `visualTiers[${index}]`, tier)),
    enemies: readEnemies(reader, reader.object('enemies', file.enemies)),
  }
}

function readOre(reader: FieldReader, ore: Record<string, unknown>): Economy['ore'] {
  return {
    tiersPerPlanet: reader.safeInteger('ore.tiersPerPlanet', ore.tiersPerPlanet),
    coreTierBand: reader.safeInteger('ore.coreTierBand', ore.coreTierBand),
    valueAtTier1: reader.money('ore.valueAtTier1', ore.valueAtTier1),
    valueRatio: reader.money('ore.valueRatio', ore.valueRatio),
    hardnessRatio: reader.money('ore.hardnessRatio', ore.hardnessRatio),
    coreHardnessMultiplier: reader.money('ore.coreHardnessMultiplier', ore.coreHardnessMultiplier),
    coreHardnessBand: reader.safeInteger('ore.coreHardnessBand', ore.coreHardnessBand),
  }
}

function readPlanets(reader: FieldReader, planets: Record<string, unknown>): Economy['planets'] {
  const paceScale = reader.object('planets.paceScale', planets.paceScale)
  return {
    coreFraction: reader.money('planets.coreFraction', planets.coreFraction),
    fragmentsPerTile: reader.safeInteger('planets.fragmentsPerTile', planets.fragmentsPerTile),
    paceScale: {
      default: reader.money('planets.paceScale.default', paceScale.default),
      byPlanet: readPaceScaleByPlanet(reader, paceScale.byPlanet),
    },
  }
}

/** Keys are planet indexes written as JSON object keys ("3": "1.1"). */
function readPaceScaleByPlanet(reader: FieldReader, value: unknown): Map<number, Money> {
  const entries = Object.entries(reader.object('planets.paceScale.byPlanet', value))
  return new Map(
    entries.map(([key, scale]) => [
      readPlanetKey(reader, key),
      reader.money(`planets.paceScale.byPlanet.${key}`, scale),
    ]),
  )
}

function readPlanetKey(reader: FieldReader, key: string): number {
  const planetIndex = /^[1-9][0-9]*$/.test(key) ? Number.parseInt(key) : Number.NaN
  return reader.safeInteger(`planets.paceScale.byPlanet key ${key}`, planetIndex)
}

function readPrices(reader: FieldReader, prices: Record<string, unknown>): Economy['prices'] {
  const rescueFee = reader.object('prices.rescueFee', prices.rescueFee)
  const travelFee = reader.object('prices.travelFee', prices.travelFee)
  return {
    referenceBand: reader.safeInteger('prices.referenceBand', prices.referenceBand),
    assayBeaconBand: reader.safeInteger('prices.assayBeaconBand', prices.assayBeaconBand),
    chargePerEnergyUnit: reader.money('prices.chargePerEnergyUnit', prices.chargePerEnergyUnit),
    fullRepair: reader.money('prices.fullRepair', prices.fullRepair),
    rescueFee: {
      moneyFraction: reader.money('prices.rescueFee.moneyFraction', rescueFee.moneyFraction),
      floor: reader.money('prices.rescueFee.floor', rescueFee.floor),
      cap: reader.money('prices.rescueFee.cap', rescueFee.cap),
    },
    travelFee: {
      fraction: reader.money('prices.travelFee.fraction', travelFee.fraction),
      oreUnits: reader.money('prices.travelFee.oreUnits', travelFee.oreUnits),
      band: reader.safeInteger('prices.travelFee.band', travelFee.band),
    },
  }
}

function readEnergy(reader: FieldReader, energy: Record<string, unknown>): Economy['energy'] {
  const perSecond = reader.object('energy.perSecond', energy.perSecond)
  return {
    perSecond: {
      drill: reader.money('energy.perSecond.drill', perSecond.drill),
      thrust: reader.money('energy.perSecond.thrust', perSecond.thrust),
      drive: reader.money('energy.perSecond.drive', perSecond.drive),
    },
    rescueFloorFraction: reader.money('energy.rescueFloorFraction', energy.rescueFloorFraction),
  }
}

function readDrill(reader: FieldReader, drill: Record<string, unknown>): Economy['drill'] {
  return {
    scratchFloor: reader.money('drill.scratchFloor', drill.scratchFloor),
    minTicksPerTile: reader.safeInteger('drill.minTicksPerTile', drill.minTicksPerTile),
  }
}

function readCasing(
  reader: FieldReader,
  casing: Record<string, unknown>,
  costCurves: readonly CostCurve[],
): Economy['casing'] {
  const costCurveId = reader.text('casing.costCurveId', casing.costCurveId)
  if (!costCurves.some((curve) => curve.id === costCurveId)) {
    reader.record(`casing.costCurveId ${costCurveId} has no curve in costCurves`)
  }
  return {
    costCurveId,
    casingGradeStart: reader.safeInteger('casing.casingGradeStart', casing.casingGradeStart),
  }
}

function readCostCurve(reader: FieldReader, path: string, value: unknown): CostCurve {
  const curve = reader.object(path, value)
  return {
    id: reader.text(`${path}.id`, curve.id),
    family: readLiteral(reader, `${path}.family`, curve.family, ['geometric'] as const),
    base: reader.money(`${path}.base`, curve.base),
    ratio: reader.money(`${path}.ratio`, curve.ratio),
  }
}

function readUpgrade(reader: FieldReader, path: string, value: unknown): UpgradeDef {
  const upgrade = reader.object(path, value)
  const onCurve = reader.object(`${path}.onCurve`, upgrade.onCurve)
  if (upgrade.maxLevel !== null) reader.record(`${path}.maxLevel must be null (uncapped, #7)`)
  return {
    id: readLiteral(reader, `${path}.id`, upgrade.id, UPGRADE_IDS),
    costCurveId: reader.text(`${path}.costCurveId`, upgrade.costCurveId),
    maxLevel: null,
    effect: readUpgradeEffect(reader, `${path}.effect`, upgrade.effect),
    onCurve: {
      levelAtPlanet1: reader.safeInteger(`${path}.onCurve.levelAtPlanet1`, onCurve.levelAtPlanet1),
      levelsPerPlanet: reader.safeInteger(
        `${path}.onCurve.levelsPerPlanet`,
        onCurve.levelsPerPlanet,
      ),
    },
  }
}

function readUpgradeEffect(reader: FieldReader, path: string, value: unknown): UpgradeEffect {
  const effect = reader.object(path, value)
  const families = ['geometric', 'linear', 'saturating'] as const
  const family = readLiteral(reader, `${path}.family`, effect.family, families)
  if (family === 'linear') return readLinearEffect(reader, path, effect)
  if (family === 'saturating') return readSaturatingEffect(reader, path, effect)
  return readGeometricEffect(reader, path, effect)
}

function readGeometricEffect(
  reader: FieldReader,
  path: string,
  effect: Record<string, unknown>,
): GeometricEffect {
  const stats = ['drillPower', 'drillTip', 'hullMax'] as const
  return {
    family: 'geometric',
    stat: readLiteral(reader, `${path}.stat`, effect.stat, stats),
    start: reader.money(`${path}.start`, effect.start),
    ratio: reader.money(`${path}.ratio`, effect.ratio),
  }
}

function readLinearEffect(
  reader: FieldReader,
  path: string,
  effect: Record<string, unknown>,
): LinearEffect {
  const stats = ['energyMax', 'cargoCapacity'] as const
  return {
    family: 'linear',
    stat: readLiteral(reader, `${path}.stat`, effect.stat, stats),
    start: reader.safeInteger(`${path}.start`, effect.start),
    step: reader.safeInteger(`${path}.step`, effect.step),
  }
}

function readSaturatingEffect(
  reader: FieldReader,
  path: string,
  effect: Record<string, unknown>,
): SaturatingEffect {
  const stats = reader.object(`${path}.stats`, effect.stats)
  return {
    family: 'saturating',
    halfLevel: reader.safeInteger(`${path}.halfLevel`, effect.halfLevel),
    stats: {
      speedMax: readRange(reader, `${path}.stats.speedMax`, stats.speedMax),
      accel: readRange(reader, `${path}.stats.accel`, stats.accel),
      thrustToWeight: readRange(reader, `${path}.stats.thrustToWeight`, stats.thrustToWeight),
    },
  }
}

function readVisualTier(reader: FieldReader, path: string, value: unknown): VisualTierThreshold {
  const tier = reader.object(path, value)
  return {
    tier: reader.safeInteger(`${path}.tier`, tier.tier),
    minTotalLevel: reader.safeInteger(`${path}.minTotalLevel`, tier.minTotalLevel),
  }
}

/**
 * #20 Gameplay & Vehicle acceptance 1: exactly the six tracks, each pointing at its own
 * `cost.vehicle.<id>` curve, and that curve present in the file.
 */
function checkUpgradeSet(
  reader: FieldReader,
  upgrades: readonly UpgradeDef[],
  costCurves: readonly CostCurve[],
): void {
  const curveIds = new Set(costCurves.map((curve) => curve.id))
  UPGRADE_IDS.forEach((id) => checkTrackListedOnce(reader, id, upgrades))
  upgrades.forEach((upgrade, index) => checkTrackEffect(reader, index, upgrade))
  upgrades.forEach((upgrade, index) => checkCostCurveLink(reader, index, upgrade, curveIds))
}

function checkCostCurveLink(
  reader: FieldReader,
  index: number,
  upgrade: UpgradeDef,
  curveIds: ReadonlySet<string>,
): void {
  const expected = `cost.vehicle.${upgrade.id}`
  if (upgrade.costCurveId !== expected) {
    reader.record(`upgrades[${index}].costCurveId must be ${expected}`)
  } else if (!curveIds.has(expected)) {
    reader.record(`upgrades[${index}].costCurveId ${expected} has no curve in costCurves`)
  }
}

function checkTrackListedOnce(
  reader: FieldReader,
  id: UpgradeId,
  upgrades: readonly UpgradeDef[],
): void {
  const count = upgrades.filter((upgrade) => upgrade.id === id).length
  if (count !== 1) reader.record(`upgrades must list the track ${id} once, found ${count}`)
}

function checkTrackEffect(reader: FieldReader, index: number, upgrade: UpgradeDef): void {
  const declared = describeEffect(upgrade.effect)
  const expected = TRACK_EFFECTS[upgrade.id]
  if (declared !== expected) {
    reader.record(`upgrades[${index}].effect must be ${expected} for ${upgrade.id}`)
  }
}

function describeEffect(effect: UpgradeEffect): string {
  return effect.family === 'saturating' ? 'saturating engine' : `${effect.family} ${effect.stat}`
}
