/**
 * The live blasting charges as the authority replica holds them (#109), read without React for the
 * scene's per-frame drawing. Nothing is written.
 */
import type { PlantedCharge } from '../systems/vehicle/vehicleCharges'
import { readAuthorityState } from './authorityLink'

/** Fills `into` with every vehicle's live charge, reusing it so a frame allocates nothing; the tick. */
export function readLiveChargesInto(into: PlantedCharge[]): number {
  const state = readAuthorityState()
  into.length = 0
  for (const playerId in state.players) {
    const planted = state.players[playerId].vehicle.charges.planted
    if (planted !== null) into.push(planted)
  }
  return state.tick
}
