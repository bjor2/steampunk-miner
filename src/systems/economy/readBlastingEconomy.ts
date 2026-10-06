/** Reads the `blasting_charges` part of `economy.json` (spec #109, Systems & Economy numbers). */
import type { BlastingChargeRules, CostCurve } from './economyDefinition'
import { readBandOreCost, type FieldReader } from './economyFieldReader'

const PATH = 'blastingCharges'

export function readBlastingCharges(
  reader: FieldReader,
  rules: Record<string, unknown>,
  costCurves: readonly CostCurve[],
): BlastingChargeRules {
  const read: BlastingChargeRules = {
    fuseTicks: reader.safeInteger(`${PATH}.fuseTicks`, rules.fuseTicks),
    blastRadiusTiles: reader.money(`${PATH}.blastRadiusTiles`, rules.blastRadiusTiles),
    oreYieldFraction: reader.money(`${PATH}.oreYieldFraction`, rules.oreYieldFraction),
    selfHit: reader.money(`${PATH}.selfHit`, rules.selfHit),
    enemyDamageHealthMultiple: reader.money(
      `${PATH}.enemyDamageHealthMultiple`,
      rules.enemyDamageHealthMultiple,
    ),
    warnTiles: reader.safeInteger(`${PATH}.warnTiles`, rules.warnTiles),
    rackStart: reader.safeInteger(`${PATH}.rackStart`, rules.rackStart),
    rackMax: reader.safeInteger(`${PATH}.rackMax`, rules.rackMax),
    chargeCost: readBandOreCost(reader, `${PATH}.chargeCost`, rules.chargeCost),
    rackSlotCostCurveId: reader.text(`${PATH}.rackSlotCostCurveId`, rules.rackSlotCostCurveId),
    hardnessCapBand: reader.safeInteger(`${PATH}.hardnessCapBand`, rules.hardnessCapBand),
    botBlastThresholdTicks: reader.safeInteger(
      `${PATH}.botBlastThresholdTicks`,
      rules.botBlastThresholdTicks,
    ),
  }
  checkRackSlotCurve(reader, read, costCurves)
  return read
}

/** Every rack slot level adds one charge, so the `bandOre` curve prices `rackMax - rackStart`. */
function checkRackSlotCurve(
  reader: FieldReader,
  rules: BlastingChargeRules,
  costCurves: readonly CostCurve[],
): void {
  const curve = costCurves.find((candidate) => candidate.id === rules.rackSlotCostCurveId)
  if (curve === undefined || curve.family !== 'bandOre') {
    reader.record(`${PATH}.rackSlotCostCurveId ${rules.rackSlotCostCurveId} has no bandOre curve`)
  } else if (rules.rackStart + curve.oreUnitsByLevel.length !== rules.rackMax) {
    reader.record(`${PATH}.rackMax must be rackStart plus one per ${curve.id} level`)
  }
}
