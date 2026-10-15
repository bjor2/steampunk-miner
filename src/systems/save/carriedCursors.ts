/**
 * Snapshot 20 -> 21 (ticket 399), a save migration step's reshape: the swept cut's cursor gains the
 * work it carries toward its next cell, `carrySubSteps`, at 0, as a step that does not continue it
 * starts; a vehicle with no cursor (a drill step never sent) is left as it was. Nothing else in the
 * state changes.
 */
import type { PortableState } from '../authority/sessionSnapshot'

export function withCarriedCursors(state: PortableState): PortableState {
  const players = Object.entries(state.players).map(([id, player]) => {
    const { vehicle } = player
    if (vehicle.sweptCut === undefined) return [id, player] as const
    const sweptCut = { ...vehicle.sweptCut, carrySubSteps: 0 }
    return [id, { ...player, vehicle: { ...vehicle, sweptCut } }] as const
  })
  return { ...state, players: Object.fromEntries(players) }
}
