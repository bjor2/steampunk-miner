/** Reads the `blasting_charges` part of `economy.json` (spec #109, the size ladder of K8 #218). */
import { cmp } from '../money'
import type { BlastingChargeRules, ChargeSizeLadder, CostCurve } from './economyDefinition'
import { readIntegerList, type FieldReader } from './economyFieldReader'

const PATH = 'blastingCharges'
const SIZES_PATH = `${PATH}.sizes`

export function readBlastingCharges(
  reader: FieldReader,
  rules: Record<string, unknown>,
  costCurves: readonly CostCurve[],
): BlastingChargeRules {
  const read: BlastingChargeRules = {
    selfHit: reader.money(`${PATH}.selfHit`, rules.selfHit),
    enemyDamageHealthMultiple: reader.money(
      `${PATH}.enemyDamageHealthMultiple`,
      rules.enemyDamageHealthMultiple,
    ),
    warnTiles: reader.safeInteger(`${PATH}.warnTiles`, rules.warnTiles),
    rackStart: reader.safeInteger(`${PATH}.rackStart`, rules.rackStart),
    rackMax: reader.safeInteger(`${PATH}.rackMax`, rules.rackMax),
    rackSlotCostCurveId: reader.text(`${PATH}.rackSlotCostCurveId`, rules.rackSlotCostCurveId),
    hardnessCapBand: reader.safeInteger(`${PATH}.hardnessCapBand`, rules.hardnessCapBand),
    botBlastThresholdTicks: reader.safeInteger(
      `${PATH}.botBlastThresholdTicks`,
      rules.botBlastThresholdTicks,
    ),
    sizes: readChargeSizes(reader, reader.object(SIZES_PATH, rules.sizes)),
  }
  checkRackSlotCurve(reader, read, costCurves)
  checkChargeSizes(reader, read)
  return read
}

function readChargeSizes(reader: FieldReader, sizes: Record<string, unknown>): ChargeSizeLadder {
  return {
    radius: reader
      .list(`${SIZES_PATH}.radius`, sizes.radius)
      .map((entry, index) => reader.money(`${SIZES_PATH}.radius[${index}]`, entry)),
    unlockFrom: reader.safeInteger(`${SIZES_PATH}.unlockFrom`, sizes.unlockFrom),
    unlockEvery: reader.safeInteger(`${SIZES_PATH}.unlockEvery`, sizes.unlockEvery),
    oreUnitsBand: reader.safeInteger(`${SIZES_PATH}.oreUnitsBand`, sizes.oreUnitsBand),
    oreUnitsBase: reader.money(`${SIZES_PATH}.oreUnitsBase`, sizes.oreUnitsBase),
    oreUnitsRatio: reader.money(`${SIZES_PATH}.oreUnitsRatio`, sizes.oreUnitsRatio),
    keptBase: reader.money(`${SIZES_PATH}.keptBase`, sizes.keptBase),
    keptRatio: reader.money(`${SIZES_PATH}.keptRatio`, sizes.keptRatio),
    rackSlots: readIntegerList(reader, `${SIZES_PATH}.rackSlots`, sizes.rackSlots),
    fuseTicks: readIntegerList(reader, `${SIZES_PATH}.fuseTicks`, sizes.fuseTicks),
    lethalCoreFrom: reader.safeInteger(`${SIZES_PATH}.lethalCoreFrom`, sizes.lethalCoreFrom),
    lethalCoreFraction: reader.money(`${SIZES_PATH}.lethalCoreFraction`, sizes.lethalCoreFraction),
    newestSizeLead: reader.safeInteger(`${SIZES_PATH}.newestSizeLead`, sizes.newestSizeLead),
    remoteDisarmTicks: reader.safeInteger(
      `${SIZES_PATH}.remoteDisarmTicks`,
      sizes.remoteDisarmTicks,
    ),
  }
}

/** Every rack slot level adds one slot, so the `bandOre` curve prices `rackMax - rackStart`. */
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

/** One entry per size in every per-size list, radii growing, and each size fitting a full rack. */
function checkChargeSizes(reader: FieldReader, rules: BlastingChargeRules): void {
  ladderProblems(rules).forEach((problem) => reader.record(`${SIZES_PATH}.${problem}`))
}

function ladderProblems({ sizes, rackMax }: BlastingChargeRules): string[] {
  const count = sizes.radius.length
  const checks: [boolean, string][] = [
    [count > 0, 'radius must list at least size 1'],
    [isGrowing(sizes.radius), 'radius must grow with every size'],
    [sizes.rackSlots.length === count, 'rackSlots must hold one entry per radius'],
    [
      sizes.rackSlots.every((slots) => slots >= 1 && slots <= rackMax),
      'rackSlots must fit 1 to rackMax',
    ],
    [
      sizes.fuseTicks.length >= 1 && sizes.fuseTicks.length <= count,
      'fuseTicks must fuse size 1 and no size past the radius list',
    ],
    [sizes.fuseTicks.every((ticks) => ticks >= 1), 'fuseTicks must be at least 1'],
    [
      sizes.unlockFrom >= 1 && sizes.unlockEvery >= 1,
      'unlockFrom and unlockEvery must be at least 1',
    ],
    [sizes.remoteDisarmTicks >= 1, 'remoteDisarmTicks must be at least 1'],
  ]
  return checks.filter(([isMet]) => !isMet).map(([, problem]) => problem)
}

function isGrowing(radius: ChargeSizeLadder['radius']): boolean {
  return radius.every((tiles, at) => at === 0 || cmp(tiles, radius[at - 1]) > 0)
}
