/**
 * Spec plumbing for the drill-gear lane, on the loaded slices: a planet-1 session with drill gear
 * in its sockets, the miner reported above a chosen tile, and the input situation a key press is
 * routed in, set up through `debug.*` commands like a start scenario. Only specs use it.
 */
import type { AuthorityState } from '../../systems/authority/authorityState'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import type { InputSituation } from '../../systems/input/inputRouting'
import type { Facing } from '../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../systems/world/tileGrid'
import { intentToUseSlot, type DrillGearSocket } from '../power-up-core'

export const press = (socket: DrillGearSocket) => intentToUseSlot(socket)

export const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

/** A session at tick 1 with `slots` filled (owning each item), the miner above `tile`. */
export function sessionWith(
  slots: Readonly<Record<string, string>>,
  tile: TilePoint,
  facing: Facing,
): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand(slots))
  session.submit(1, poseAbove(tile, facing))
  return session
}

/** Driving, with nothing in reach: the layer and state a slice's key reaction reads. */
export function drivingIn(state: AuthorityState): InputSituation {
  return {
    layer: 'vehicle',
    vehicleMode: 'active',
    dockableBay: null,
    dockedBay: null,
    canOpenArtefactCache: false,
    gunMode: null,
    plantableChargeSize: null,
    nextChargeSize: null,
    state,
    playerId: 'p1',
  }
}
