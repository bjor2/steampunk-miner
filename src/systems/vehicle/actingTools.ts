/**
 * The tools acting on a vehicle (ticket 848, the TD's seam on #823, 6388823846): host state, the
 * one flag a tool's trade-off and its hazard factor read, so neither applies while the tool only
 * sits on the rig. The vehicle's optional `actingTools` lists the acting tool ids in code-unit
 * order; it is absent while none acts, so a rig that never used a tool digests as before.
 */
import type { VehicleState } from './vehicleState'

const NONE_ACTING: readonly string[] = Object.freeze([])

export function actingToolsOf(vehicle: VehicleState): readonly string[] {
  return vehicle.actingTools ?? NONE_ACTING
}

export function isToolActing(vehicle: VehicleState, toolId: string): boolean {
  return actingToolsOf(vehicle).includes(toolId)
}

/** The vehicle with `toolId` acting, the list kept in code-unit order. */
export function withToolActing(vehicle: VehicleState, toolId: string): VehicleState {
  if (isToolActing(vehicle, toolId)) return vehicle
  return { ...vehicle, actingTools: [...actingToolsOf(vehicle), toolId].sort() }
}

/** The vehicle with `toolId` no longer acting; the field goes when the last one stops. */
export function withoutToolActing(vehicle: VehicleState, toolId: string): VehicleState {
  if (!isToolActing(vehicle, toolId)) return vehicle
  const rest = actingToolsOf(vehicle).filter((id) => id !== toolId)
  const { actingTools: _stopped, ...vehicleWithNone } = vehicle
  return rest.length === 0 ? vehicleWithNone : { ...vehicleWithNone, actingTools: rest }
}

/** Whether a portable `actingTools` is absent or a non-empty list of ids in code-unit order. */
export function isPortableActingTools(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length === 0) return false
  return value.every(
    (id, at) => typeof id === 'string' && id !== '' && (at === 0 || value[at - 1] < id),
  )
}
