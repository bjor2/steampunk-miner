/**
 * The look the slices ask of the local vehicle this frame (ticket 389, `vehicleLooks`): drawn
 * each frame from the authority replica at its tick, with the flashes the store's event batches
 * started, and under reduced effects (the `flashes` switch off) the wash and the see-through body
 * swapped for one outline. A mutable record, because it changes every frame and never goes
 * through React or the store; this module is its only writer, `VehicleLook` its reader.
 */
import type { DomainEvent } from '../systems/authority/domainEvent'
import { readAuthorityState } from '../store/authorityLink'
import { useGameStore } from '../store/gameStore'
import {
  createDrawnVehicleLook,
  createLookFlashes,
  drawVehicleLookAt,
  startLookFlashes,
  swapVeilForOutline,
  type DrawnVehicleLook,
  type VehicleLookMoment,
} from '../systems/render/vehicleLookFold'

const drawn = createDrawnVehicleLook()
const flashes = createLookFlashes()
/** Made on the first frame, as the replica is not there at import; rewritten after. */
let moment: VehicleLookMoment | null = null

/** A `listenForDomainEvents` listener: each batch's flashes start at the replica's tick. */
export function followLookFlashes(events: readonly DomainEvent[], playerId: string): void {
  startLookFlashes(flashes, events, playerId, readAuthorityState().tick)
}

export function drawVehicleLookNow(): DrawnVehicleLook {
  drawVehicleLookAt(drawn, flashes, momentNow())
  if (isEffectsReduced()) swapVeilForOutline(drawn)
  return drawn
}

function momentNow(): VehicleLookMoment {
  const state = readAuthorityState()
  moment ??= { state, playerId: '', tick: 0 }
  moment.state = state
  moment.playerId = useGameStore.getState().playerId
  moment.tick = state.tick
  return moment
}

/** The flashes switch is the reduced-effects switch (#33), as the sell burst reads it. */
function isEffectsReduced(): boolean {
  return !useGameStore.getState().prefs.flashes
}
