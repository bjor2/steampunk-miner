/**
 * Reads the six upgrade tracks of `economy.json` (#7 `UpgradeDef`) and checks them against their
 * cost curves: exactly the six tracks, each with the effect family `TRACK_EFFECTS` names and its
 * own `cost.vehicle.<id>` curve. A track bought per purchase (drill power since ticket 552; the
 * boiler, the hold and the engine since ticket 553, Systems' rows on #553) is priced per purchase,
 * and every other one per major.
 */
import { readLiteral, type FieldReader } from './economyFieldReader'
import {
  PER_PURCHASE_EFFECT_FAMILIES,
  TRACK_EFFECTS,
  UPGRADE_IDS,
  type CostCurve,
  type EnginePerPurchaseEffect,
  type GeometricEffect,
  type PerPurchaseEffect,
  type UpgradeDef,
  type UpgradeEffect,
  type UpgradeId,
  type WholePerPurchaseEffect,
} from './economyDefinition'

const EFFECT_FAMILIES = [
  'geometric',
  'perPurchase',
  'wholePerPurchase',
  'enginePerPurchase',
] as const

/** The whole-number stats bought per purchase: the hold's units and the boiler's tank (553). */
const WHOLE_STATS = ['cargoCapacity', 'energyMax'] as const

const PURCHASE_COST_FAMILIES: readonly CostCurve['family'][] = [
  'perPurchase',
  'geometricPerPurchase',
]

export function readUpgrade(reader: FieldReader, path: string, value: unknown): UpgradeDef {
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
      atMost: readOnCurveAtMost(reader, `${path}.onCurve.atMost`, onCurve.atMost),
    },
  }
}

/** Optional: a track with no on-curve stop leaves it out (ticket 553). */
function readOnCurveAtMost(reader: FieldReader, path: string, value: unknown): number | null {
  return value === undefined ? null : reader.safeInteger(path, value)
}

function readUpgradeEffect(reader: FieldReader, path: string, value: unknown): UpgradeEffect {
  const effect = reader.object(path, value)
  const family = readLiteral(reader, `${path}.family`, effect.family, EFFECT_FAMILIES)
  if (family === 'perPurchase') return readPerPurchaseEffect(reader, path, effect)
  if (family === 'wholePerPurchase') return readWholePerPurchaseEffect(reader, path, effect)
  if (family === 'enginePerPurchase') return readEnginePerPurchaseEffect(reader, path, effect)
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

function readPerPurchaseEffect(
  reader: FieldReader,
  path: string,
  effect: Record<string, unknown>,
): PerPurchaseEffect {
  const firstGain = reader.object(`${path}.firstGain`, effect.firstGain)
  return {
    family: 'perPurchase',
    stat: readLiteral(reader, `${path}.stat`, effect.stat, ['drillPower'] as const),
    start: reader.money(`${path}.start`, effect.start),
    firstGain: {
      ratio: reader.money(`${path}.firstGain.ratio`, firstGain.ratio),
      root: reader.safeInteger(`${path}.firstGain.root`, firstGain.root),
    },
    ratio: reader.money(`${path}.ratio`, effect.ratio),
  }
}

function readWholePerPurchaseEffect(
  reader: FieldReader,
  path: string,
  effect: Record<string, unknown>,
): WholePerPurchaseEffect {
  return {
    family: 'wholePerPurchase',
    stat: readLiteral(reader, `${path}.stat`, effect.stat, WHOLE_STATS),
    start: reader.money(`${path}.start`, effect.start),
    ratio: reader.money(`${path}.ratio`, effect.ratio),
  }
}

function readEnginePerPurchaseEffect(
  reader: FieldReader,
  path: string,
  effect: Record<string, unknown>,
): EnginePerPurchaseEffect {
  const start = reader.object(`${path}.start`, effect.start)
  return {
    family: 'enginePerPurchase',
    ratio: reader.money(`${path}.ratio`, effect.ratio),
    start: {
      speedMax: reader.money(`${path}.start.speedMax`, start.speedMax),
      accel: reader.money(`${path}.start.accel`, start.accel),
      netLift: reader.money(`${path}.start.netLift`, start.netLift),
    },
  }
}

/**
 * #20 Gameplay & Vehicle acceptance 1: exactly the six tracks, each pointing at its own
 * `cost.vehicle.<id>` curve, and that curve present in the file.
 */
export function checkUpgradeSet(
  reader: FieldReader,
  upgrades: readonly UpgradeDef[],
  costCurves: readonly CostCurve[],
): void {
  const curves = new Map(costCurves.map((curve) => [curve.id, curve]))
  UPGRADE_IDS.forEach((id) => checkTrackListedOnce(reader, id, upgrades))
  upgrades.forEach((upgrade, index) => checkTrackEffect(reader, index, upgrade))
  upgrades.forEach((upgrade, index) => checkCostCurveLink(reader, index, upgrade, curves))
}

/** A track bought per purchase is priced per purchase, and every other one per major (#552). */
function checkCostCurveLink(
  reader: FieldReader,
  index: number,
  upgrade: UpgradeDef,
  curves: ReadonlyMap<string, CostCurve>,
): void {
  const expected = `cost.vehicle.${upgrade.id}`
  const curve = curves.get(expected)
  if (upgrade.costCurveId !== expected) {
    reader.record(`upgrades[${index}].costCurveId must be ${expected}`)
  } else if (curve === undefined) {
    reader.record(`upgrades[${index}].costCurveId ${expected} has no curve in costCurves`)
  } else if (!isCurvePricedLikeEffect(upgrade.effect, curve)) {
    reader.record(
      `upgrades[${index}].costCurveId ${expected} must be a ${pricingOf(upgrade)} curve`,
    )
  }
}

function isCurvePricedLikeEffect(effect: UpgradeEffect, curve: CostCurve): boolean {
  const isPerPurchase = PER_PURCHASE_EFFECT_FAMILIES.includes(effect.family)
  if (isPerPurchase) return PURCHASE_COST_FAMILIES.includes(curve.family)
  return curve.family === 'geometric'
}

function pricingOf(upgrade: UpgradeDef): string {
  return PER_PURCHASE_EFFECT_FAMILIES.includes(upgrade.effect.family)
    ? PURCHASE_COST_FAMILIES.join(' or ')
    : 'geometric'
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
  return effect.family === 'enginePerPurchase'
    ? 'enginePerPurchase engine'
    : `${effect.family} ${effect.stat}`
}
