/**
 * The snapshot's check of the vehicle fields ticket 848 adds, each optional and absent at rest:
 * the dive's hazard tally, the tools acting, when each context tool last saw its context (ticket
 * 881) and a vent's shove. They travel as they are held (whole numbers, ids and tiles), so the
 * portable vehicle carries them unchanged.
 */
import { isPortableActingTools, isPortableToolsSeenAt } from '../../vehicle/actingTools'
import { isJsonObject, isWholeNumber } from '../payloadFields'

export function hazardVehicleFieldProblems(
  vehicle: Record<string, unknown>,
  path: string,
): string[] {
  return [
    ...(vehicle.hazardHullBp === undefined || isWholeNumber(vehicle.hazardHullBp)
      ? []
      : [`${path}.hazardHullBp must be a whole number of basis points, or be left out`]),
    ...(isPortableActingTools(vehicle.actingTools)
      ? []
      : [`${path}.actingTools must list tool ids in code-unit order, or be left out`]),
    ...(isPortableToolsSeenAt(vehicle.toolsSeenAt)
      ? []
      : [`${path}.toolsSeenAt must list { toolId, tick } in tool id order, or be left out`]),
    ...(vehicle.hazardShove === undefined || isPortableShove(vehicle.hazardShove)
      ? []
      : [`${path}.hazardShove must hold a tile, a whole tick and no pass-through, or be left out`]),
  ]
}

function isPortableShove(shove: unknown): boolean {
  return (
    isJsonObject(shove) &&
    isJsonObject(shove.to) &&
    Number.isSafeInteger(shove.to.tx) &&
    Number.isSafeInteger(shove.to.ty) &&
    isWholeNumber(shove.untilTick) &&
    shove.passThrough === null
  )
}
