/**
 * The tools acting on a vehicle (ticket 848, the TD's seam on #823, 6388823846): host state, the
 * one flag a tool's trade-off and its hazard factor read, so neither applies while the tool only
 * sits on the rig. The vehicle's optional `actingTools` lists the acting tool ids in code-unit
 * order; it is absent while none acts, so a rig that never used a tool digests as before.
 *
 * A tool that acts by context (ticket 881, `authority/hazards/toolContexts.ts`) also keeps the tick
 * its context was last seen in the optional `toolsSeenAt`, so it acts on through its tail after
 * the rig leaves the context (G&V's 0.5 s hysteresis on #850). Stopping a tool drops its entry.
 */
import type { VehicleState } from './vehicleState'

/** The tick a context-acting tool's context was last seen at the rig. */
export interface ToolSeenAt {
  toolId: string
  tick: number
}

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

/** The vehicle with `toolId` no longer acting, nor seen; each field goes when it empties. */
export function withoutToolActing(vehicle: VehicleState, toolId: string): VehicleState {
  if (!isToolActing(vehicle, toolId)) return vehicle
  const rest = actingToolsOf(vehicle).filter((id) => id !== toolId)
  const { actingTools: _stopped, ...vehicleWithNone } = withoutToolSeen(vehicle, toolId)
  return rest.length === 0 ? vehicleWithNone : { ...vehicleWithNone, actingTools: rest }
}

/** The tick `toolId`'s context was last seen, or null when it is not kept. */
export function toolSeenTickOf(vehicle: VehicleState, toolId: string): number | null {
  return vehicle.toolsSeenAt?.find((seen) => seen.toolId === toolId)?.tick ?? null
}

/** The vehicle with `toolId`'s context seen at `tick`, the list kept in code-unit order. */
export function withToolSeenAt(vehicle: VehicleState, toolId: string, tick: number): VehicleState {
  if (toolSeenTickOf(vehicle, toolId) === tick) return vehicle
  const others = (vehicle.toolsSeenAt ?? []).filter((seen) => seen.toolId !== toolId)
  const toolsSeenAt = [...others, { toolId, tick }].sort(compareSeen)
  return { ...vehicle, toolsSeenAt }
}

/** Whether a portable `actingTools` is absent or a non-empty list of ids in code-unit order. */
export function isPortableActingTools(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length === 0) return false
  return value.every(
    (id, at) => typeof id === 'string' && id !== '' && (at === 0 || value[at - 1] < id),
  )
}

/** Whether a portable `toolsSeenAt` is absent or a non-empty list of `{toolId, tick}` in id order. */
export function isPortableToolsSeenAt(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value) || value.length === 0 || !value.every(isPortableSeen)) return false
  return value.every((seen, at) => at === 0 || value[at - 1].toolId < seen.toolId)
}

function withoutToolSeen(vehicle: VehicleState, toolId: string): VehicleState {
  if (toolSeenTickOf(vehicle, toolId) === null) return vehicle
  const rest = (vehicle.toolsSeenAt ?? []).filter((seen) => seen.toolId !== toolId)
  const { toolsSeenAt: _dropped, ...vehicleWithNone } = vehicle
  return rest.length === 0 ? vehicleWithNone : { ...vehicleWithNone, toolsSeenAt: rest }
}

function compareSeen(a: ToolSeenAt, b: ToolSeenAt): number {
  return a.toolId < b.toolId ? -1 : a.toolId > b.toolId ? 1 : 0
}

function isPortableSeen(seen: unknown): seen is ToolSeenAt {
  if (typeof seen !== 'object' || seen === null || Array.isArray(seen)) return false
  const { toolId, tick, ...extra } = seen as Record<string, unknown>
  return (
    typeof toolId === 'string' &&
    toolId !== '' &&
    Number.isSafeInteger(tick) &&
    (tick as number) >= 0 &&
    Object.keys(extra).length === 0
  )
}
