/**
 * A tool's acting flag (ticket 848, the TD's seam on #823, 6388823846): host state the tool's verb
 * sets while it acts, so its trade-off (`toolTradeOffs.ts`) and its hazard factor
 * (`contactEffects.ts`) apply only then and never linger after release. Every change is one
 * `ToolActingChanged`, logged as `tool_acting {toolId, on}`; starting a tool already acting, or
 * stopping one that is not, changes nothing and says nothing. Docking stops every tool.
 */
import {
  actingToolsOf,
  isToolActing,
  withoutToolActing,
  withToolActing,
} from '../../vehicle/actingTools'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'

export function startToolActing(
  state: AuthorityState,
  playerId: string,
  toolId: string,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (isToolActing(vehicle, toolId)) return unchanged(state)
  return {
    state: withVehicle(state, playerId, withToolActing(vehicle, toolId)),
    events: [{ type: 'ToolActingChanged', toolId, on: true }],
  }
}

export function stopToolActing(
  state: AuthorityState,
  playerId: string,
  toolId: string,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (!isToolActing(vehicle, toolId)) return unchanged(state)
  return {
    state: withVehicle(state, playerId, withoutToolActing(vehicle, toolId)),
    events: [{ type: 'ToolActingChanged', toolId, on: false }],
  }
}

export function stopEveryToolActing(state: AuthorityState, playerId: string): RuleEffect {
  return chainEffects(
    state,
    actingToolsOf(vehicleOf(state, playerId)).map(
      (toolId) => (current: AuthorityState) => stopToolActing(current, playerId, toolId),
    ),
  )
}
