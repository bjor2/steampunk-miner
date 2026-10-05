/**
 * Where the music stands, read from the authority replica only (#49 "every trigger is computed
 * from authority state, never from presentation"): the mode, the hub distance and band the HUD
 * shows, the HUD's low-energy line, and the nearest enemy to the last accepted pose. Depth is the
 * client-owned depth every screen reads (#3).
 */
import type { AuthorityState } from '../authority/authorityState'
import { energyWarningLevel } from '../views/energyWarning'
import { depthReadingOf, dockArrowOf } from '../views/hudReadings'
import { energyMaxQuantaOf, statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import { nearestEnemyMetresOf, type MusicMoment } from './musicLayers'

export function musicMomentOf(
  state: AuthorityState,
  playerId: string,
  depthTiles: number,
): MusicMoment {
  const vehicle = state.players[playerId].vehicle
  return {
    isDocked: vehicle.mode === 'docked',
    dockDistanceMetres: dockArrowOf(state, playerId)?.distance ?? null,
    depthTiles,
    band: depthReadingOf(state, playerId, depthTiles).band,
    isEnergyLow: isEnergyLow(vehicle, depthTiles),
    nearestEnemyMetres:
      vehicle.pose === null ? null : nearestEnemyMetresOf(state.combat.enemies, vehicle.pose),
    // S10 (#64) adds the artefact cache and its choice; until it lands no choice can be open.
    isArtefactChoiceOpen: false,
  }
}

function isEnergyLow(vehicle: VehicleState, depthTiles: number): boolean {
  const level = energyWarningLevel({
    energyQuanta: vehicle.energy,
    energyMaxQuanta: energyMaxQuantaOf(vehicle),
    depthTiles,
    speedMax: statsOfVehicle(vehicle).engine.speedMax,
  })
  return level !== 'ok'
}
