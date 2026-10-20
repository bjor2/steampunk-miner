/**
 * Reads the raw `economy.json` into an `Economy`. A broken file is refused whole and every
 * problem is listed, like a scenario (CLAUDE.md "refused, never trimmed").
 */
import {
  createFieldReader,
  readBandOreCost,
  readRange,
  type FieldReader,
} from './economyFieldReader'
import { checkUpgradeSet, readUpgrade } from './readUpgradeEconomy'
import { liningTypesWithoutGrade, readCasingCementGrades } from './casingCementGrades'
import { readArchetypes } from './readArchetypeEconomy'
import { readBlastingCharges } from './readBlastingEconomy'
import { readEnemies } from './readEnemyEconomy'
import { readDrillGearCaps } from './drillGearCaps'
import { readItemHookCaps } from './itemHookCaps'
import { readItemEffectCaps } from './itemEffectCaps'
import { readMagnetCaps } from './magnetCaps'
import { readMagneticHazardCaps } from './magneticHazardCaps'
import { readTurretCaps } from './turretCaps'
import { readPaceScale } from './readPaceScale'
import { readDepthDensity } from './depthDensityCurve'
import { readSurfaceLayer } from './surfaceLayerRules'
import { readUpgradeTiers } from './readUpgradeTiers'
import { readCostCurve, readRefinery } from './readRefineryEconomy'
import type { CostCurve, Economy, VisualTierThreshold } from './economyDefinition'
import { cmp, type BigStat } from '../money'

export type EconomyReading = { economy: Economy; problems: [] } | { problems: string[] }

export function readEconomy(raw: unknown): EconomyReading {
  const reader = createFieldReader()
  const economy = readEconomyFields(reader, reader.object('economy', raw))
  checkHazardLiningsAreGrades(reader, economy)
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
    itemEffectCaps: readItemEffectCaps(reader, file.itemEffectCaps),
    drillGearCaps: readDrillGearCaps(reader, file.drillGearCaps),
    itemHookCaps: readItemHookCaps(reader, file.itemHookCaps),
    magnets: readMagnetCaps(reader, file.magnets),
    magneticHazard: readMagneticHazardCaps(reader, file.magneticHazard),
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
    largestBandOrePerRadius: reader.money(
      'planets.largestBandOrePerRadius',
      planets.largestBandOrePerRadius,
    ),
    paceScale: readPaceScale(reader, planets.paceScale),
    surfaceLayer: readSurfaceLayer(reader, planets.surfaceLayer),
    depthDensity: readDepthDensity(reader, planets.depthDensity),
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
    turretCaps: readTurretCaps(reader, gun.turretCaps),
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
    denseScratchFloor: reader.money('drill.denseScratchFloor', drill.denseScratchFloor),
    gateScratchFloor: reader.money('drill.gateScratchFloor', drill.gateScratchFloor),
    ...readTravelParity(reader, drill),
    boreRecoveryMinTicks: reader.safeInteger(
      'drill.boreRecoveryMinTicks',
      drill.boreRecoveryMinTicks,
    ),
  }
}

/** Travel parity's k, tunable only inside its bounds (VS on the #397 TD lock, ticket 400). */
function readTravelParity(
  reader: FieldReader,
  drill: Record<string, unknown>,
): Pick<Economy['drill'], 'travelParityK' | 'travelParityKBounds'> {
  const travelParityKBounds = readTravelParityKBounds(reader, drill.travelParityKBounds)
  const travelParityK = reader.money('drill.travelParityK', drill.travelParityK)
  checkTravelParityKInBounds(reader, travelParityK, travelParityKBounds)
  return { travelParityK, travelParityKBounds }
}

function readTravelParityKBounds(
  reader: FieldReader,
  value: unknown,
): Economy['drill']['travelParityKBounds'] {
  const bounds = reader.object('drill.travelParityKBounds', value)
  return {
    lowest: reader.money('drill.travelParityKBounds.lowest', bounds.lowest),
    highest: reader.money('drill.travelParityKBounds.highest', bounds.highest),
  }
}

function checkTravelParityKInBounds(
  reader: FieldReader,
  k: BigStat,
  bounds: Economy['drill']['travelParityKBounds'],
): void {
  const isInRange = cmp(k, bounds.lowest) >= 0 && cmp(k, bounds.highest) <= 0
  if (!isInRange) reader.record('drill.travelParityK must be inside drill.travelParityKBounds')
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
    cementGrades: readCasingCementGrades(reader, casing.cementGrades),
  }
}

/** Every hazard act's lining is a casing_cement grade, so it has a place and a price (ticket 366). */
function checkHazardLiningsAreGrades(reader: FieldReader, economy: Economy): void {
  const archetypeTypes = economy.archetypes.map((archetype) => archetype.liningType)
  for (const liningType of liningTypesWithoutGrade(economy.casing.cementGrades, archetypeTypes)) {
    reader.record(`archetype lining type ${liningType} is no casing.cementGrades grade`)
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

function readVisualTier(reader: FieldReader, path: string, value: unknown): VisualTierThreshold {
  const tier = reader.object(path, value)
  return {
    tier: reader.safeInteger(`${path}.tier`, tier.tier),
    minTotalLevel: reader.safeInteger(`${path}.minTotalLevel`, tier.minTotalLevel),
  }
}
