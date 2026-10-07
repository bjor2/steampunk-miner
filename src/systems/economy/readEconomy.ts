/**
 * Reads the raw `economy.json` into an `Economy`. A broken file is refused whole and every
 * problem is listed, like a scenario (CLAUDE.md "refused, never trimmed").
 */
import {
  createFieldReader,
  readBandOreCost,
  readLiteral,
  readRange,
  type FieldReader,
} from './economyFieldReader'
import { readArchetypes } from './readArchetypeEconomy'
import { readBlastingCharges } from './readBlastingEconomy'
import { readEnemies } from './readEnemyEconomy'
import { readPaceScale } from './readPaceScale'
import { readUpgradeTiers } from './readUpgradeTiers'
import { readCostCurve, readRefinery } from './readRefineryEconomy'
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
import type { BigStat } from '../money'

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
  const ore = readOre(reader, reader.object('ore', file.ore))
  return {
    economyVersion: reader.safeInteger('economyVersion', file.economyVersion),
    ore,
    planets: readPlanets(reader, reader.object('planets', file.planets)),
    prices: readPrices(reader, reader.object('prices', file.prices)),
    energy: readEnergy(reader, reader.object('energy', file.energy)),
    drill: readDrill(reader, reader.object('drill', file.drill)),
    costCurves,
    casing: readCasing(reader, reader.object('casing', file.casing), costCurves, ore.coreTierBand),
    refinery: readRefinery(reader, reader.object('refinery', file.refinery), costCurves),
    blastingCharges: readBlastingCharges(
      reader,
      reader.object('blastingCharges', file.blastingCharges),
      costCurves,
    ),
    upgrades,
    upgradeTiers: readUpgradeTiers(reader, file.upgradeTiers),
    gun: readGun(reader, reader.object('gun', file.gun)),
    archetypes: readArchetypes(reader, file.archetypes, ore.coreTierBand),
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
    signatureValueLead: reader.safeInteger('ore.signatureValueLead', ore.signatureValueLead),
    signatureDrillHardnessTierOffset: reader.safeInteger(
      'ore.signatureDrillHardnessTierOffset',
      ore.signatureDrillHardnessTierOffset,
    ),
  }
}

function readPlanets(reader: FieldReader, planets: Record<string, unknown>): Economy['planets'] {
  return {
    coreFraction: reader.money('planets.coreFraction', planets.coreFraction),
    fragmentsPerTile: reader.safeInteger('planets.fragmentsPerTile', planets.fragmentsPerTile),
    paceScale: readPaceScale(reader, planets.paceScale),
  }
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
    drillUpEnergyMult: reader.money('energy.drillUpEnergyMult', energy.drillUpEnergyMult),
    perShot: reader.money('energy.perShot', energy.perShot),
  }
}

function readGun(reader: FieldReader, gun: Record<string, unknown>): Economy['gun'] {
  const levelCost = reader.object('gun.levelCost', gun.levelCost)
  return {
    damageFractionOfDrill: reader.money('gun.damageFractionOfDrill', gun.damageFractionOfDrill),
    fireIntervalTicks: readRange(reader, 'gun.fireIntervalTicks', gun.fireIntervalTicks),
    halfLevel: reader.safeInteger('gun.halfLevel', gun.halfLevel),
    maxLevel: reader.safeInteger('gun.maxLevel', gun.maxLevel),
    rangeTiles: reader.safeInteger('gun.rangeTiles', gun.rangeTiles),
    frontDeadConeDeg: reader.safeInteger('gun.frontDeadConeDeg', gun.frontDeadConeDeg),
    mountCost: readBandOreCost(reader, 'gun.mountCost', gun.mountCost),
    levelCost: {
      ...readBandOreCost(reader, 'gun.levelCost', levelCost),
      id: reader.text('gun.levelCost.id', levelCost.id),
      ratio: reader.money('gun.levelCost.ratio', levelCost.ratio),
    },
  }
}

function readDrill(reader: FieldReader, drill: Record<string, unknown>): Economy['drill'] {
  return {
    scratchFloor: reader.money('drill.scratchFloor', drill.scratchFloor),
    gateScratchFloor: reader.money('drill.gateScratchFloor', drill.gateScratchFloor),
    minTicksPerTile: reader.safeInteger('drill.minTicksPerTile', drill.minTicksPerTile),
  }
}

function readCasing(
  reader: FieldReader,
  casing: Record<string, unknown>,
  costCurves: readonly CostCurve[],
  coreTierBand: number,
): Economy['casing'] {
  const costCurveId = reader.text('casing.costCurveId', casing.costCurveId)
  if (!costCurves.some((curve) => curve.id === costCurveId)) {
    reader.record(`casing.costCurveId ${costCurveId} has no curve in costCurves`)
  }
  return {
    costCurveId,
    casingGradeStart: reader.safeInteger('casing.casingGradeStart', casing.casingGradeStart),
    casingGradeCoreMin: reader.safeInteger('casing.casingGradeCoreMin', casing.casingGradeCoreMin),
    kCasing: reader.money('casing.kCasing', casing.kCasing),
    collapseCrush: readCollapseCrush(reader, casing.collapseCrush, coreTierBand),
  }
}

/** One hull fraction per band, the core's last (#43 Data): as many as the core's band number. */
function readCollapseCrush(reader: FieldReader, value: unknown, coreTierBand: number): BigStat[] {
  const fractions = reader
    .list('casing.collapseCrush', value)
    .map((fraction, index) => reader.money(`casing.collapseCrush[${index}]`, fraction))
  if (fractions.length !== coreTierBand) {
    reader.record(`casing.collapseCrush must list ${coreTierBand} fractions, bands then the core`)
  }
  return fractions
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
