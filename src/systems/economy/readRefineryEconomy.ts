/**
 * Reads the cost curves and the Refinery bay block of `economy.json` (#6 section 3 curves, #105
 * numbers). A curve is `geometric` (vehicle tracks, casing) or `bandOre` (the refinery's slots);
 * the refinery's slot curve must be a `bandOre` curve pricing exactly the slots past the first.
 */
import { readLiteral, type FieldReader } from './economyFieldReader'
import type { CostCurve, Economy } from './economyDefinition'

const COST_CURVE_FAMILIES = ['geometric', 'bandOre'] as const

export function readCostCurve(reader: FieldReader, path: string, value: unknown): CostCurve {
  const curve = reader.object(path, value)
  const id = reader.text(`${path}.id`, curve.id)
  const family = readLiteral(reader, `${path}.family`, curve.family, COST_CURVE_FAMILIES)
  if (family === 'bandOre') {
    return {
      id,
      family,
      band: reader.safeInteger(`${path}.band`, curve.band),
      oreUnitsByLevel: reader
        .list(`${path}.oreUnitsByLevel`, curve.oreUnitsByLevel)
        .map((units, index) => reader.money(`${path}.oreUnitsByLevel[${index}]`, units)),
    }
  }
  return {
    id,
    family,
    base: reader.money(`${path}.base`, curve.base),
    ratio: reader.money(`${path}.ratio`, curve.ratio),
  }
}

export function readRefinery(
  reader: FieldReader,
  refinery: Record<string, unknown>,
  costCurves: readonly CostCurve[],
): Economy['refinery'] {
  const read: Economy['refinery'] = {
    unlockPlanet: reader.safeInteger('refinery.unlockPlanet', refinery.unlockPlanet),
    slotsStart: reader.safeInteger('refinery.slotsStart', refinery.slotsStart),
    slotsMax: reader.safeInteger('refinery.slotsMax', refinery.slotsMax),
    batchCargoFraction: reader.money('refinery.batchCargoFraction', refinery.batchCargoFraction),
    refineSeconds: reader.safeInteger('refinery.refineSeconds', refinery.refineSeconds),
    valueMultiplier: reader.money('refinery.valueMultiplier', refinery.valueMultiplier),
    slotCostCurveId: reader.text('refinery.slotCostCurveId', refinery.slotCostCurveId),
  }
  checkSlotCurve(reader, read, costCurves)
  return read
}

/** Slots past `slotsStart` are bought one level each, so the curve prices exactly that many. */
function checkSlotCurve(
  reader: FieldReader,
  refinery: Economy['refinery'],
  costCurves: readonly CostCurve[],
): void {
  const curve = costCurves.find((candidate) => candidate.id === refinery.slotCostCurveId)
  const boughtSlots = refinery.slotsMax - refinery.slotsStart
  if (curve === undefined || curve.family !== 'bandOre') {
    reader.record(`refinery.slotCostCurveId ${refinery.slotCostCurveId} has no bandOre curve`)
  } else if (curve.oreUnitsByLevel.length !== boughtSlots) {
    reader.record(`${curve.id} must price ${boughtSlots} slots, slotsStart to slotsMax`)
  }
}
