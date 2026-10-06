/** Reads the `blasting_charges` part of `economy.json` (spec #109, Systems & Economy numbers). */
import type { BandOreCost, BlastingChargeRules } from './economyDefinition'
import type { FieldReader } from './economyFieldReader'

const PATH = 'blastingCharges'

export function readBlastingCharges(
  reader: FieldReader,
  rules: Record<string, unknown>,
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
    rackSlotCost: readRackSlotCost(reader, rules.rackSlotCost),
    hardnessCapBand: reader.safeInteger(`${PATH}.hardnessCapBand`, rules.hardnessCapBand),
    botBlastThresholdTicks: reader.safeInteger(
      `${PATH}.botBlastThresholdTicks`,
      rules.botBlastThresholdTicks,
    ),
  }
  checkRackSize(reader, read)
  return read
}

function readBandOreCost(reader: FieldReader, path: string, value: unknown): BandOreCost {
  const cost = reader.object(path, value)
  return {
    band: reader.safeInteger(`${path}.band`, cost.band),
    oreUnits: reader.money(`${path}.oreUnits`, cost.oreUnits),
  }
}

function readRackSlotCost(
  reader: FieldReader,
  value: unknown,
): BlastingChargeRules['rackSlotCost'] {
  const path = `${PATH}.rackSlotCost`
  const cost = reader.object(path, value)
  return {
    band: reader.safeInteger(`${path}.band`, cost.band),
    oreUnitsByLevel: reader
      .list(`${path}.oreUnitsByLevel`, cost.oreUnitsByLevel)
      .map((units, index) => reader.money(`${path}.oreUnitsByLevel[${index}]`, units)),
  }
}

/** Every rack slot level adds one charge, from `rackStart` to `rackMax`. */
function checkRackSize(reader: FieldReader, rules: BlastingChargeRules): void {
  const slots = rules.rackSlotCost.oreUnitsByLevel.length
  if (rules.rackStart + slots === rules.rackMax) return
  reader.record(`${PATH}.rackMax must be rackStart plus one per rackSlotCost level`)
}
