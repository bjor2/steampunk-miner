/**
 * What the three sensing passives show the local player now (#162 Sensing rows, 4.4): each is on
 * while owned (2.1) and reads at the reach of the Mark the player researched, with Mark 0 acting
 * as bought. A passive the player does not own reads null, so its panel draws nothing. The lens's
 * cards are its readings nearest the miner first, up to the cap its overlay cards hold seats with.
 * Pure reads of the authority state: reveal only (Vertical Scaler on #157).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import { tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { researchedMarkOf } from '../../tech-tree'
import { assayReadingsOf, type AssayReading } from './assayLens'
import { barometerWarningsOf, type BarometerWarning } from './hazardBarometer'
import { passiveReachOf } from './passiveReach'
import { sensingItemOf } from './sensingCatalogue'
import { periscopeWarningsOf, type PeriscopeWarning } from './threatPeriscope'

export const THREAT_PERISCOPE = 'passive.threat_periscope'
export const ASSAY_LENS = 'passive.assay_lens'
export const HAZARD_BAROMETER = 'passive.hazard_barometer'

/** The lens cards one client shows at once, nearest the miner first. */
export const LENS_CARD_CAP = 6

export interface PassiveReads {
  periscope: readonly PeriscopeWarning[] | null
  lens: readonly AssayReading[] | null
  barometer: readonly BarometerWarning[] | null
}

export const NO_PASSIVE_READS: PassiveReads = { periscope: null, lens: null, barometer: null }

export function passiveReadsOf(state: AuthorityState, playerId: string): PassiveReads {
  return {
    periscope: periscopeOf(state, playerId),
    lens: lensOf(state, playerId),
    barometer: barometerOf(state, playerId),
  }
}

function periscopeOf(state: AuthorityState, playerId: string): PeriscopeWarning[] | null {
  const reach = reachOwnedOf(state, playerId, THREAT_PERISCOPE)
  return reach === null ? null : periscopeWarningsOf(state, playerId, reach)
}

function lensOf(state: AuthorityState, playerId: string): AssayReading[] | null {
  const reach = reachOwnedOf(state, playerId, ASSAY_LENS)
  if (reach === null) return null
  return nearestReadingsOf(state, playerId, assayReadingsOf(state, playerId, reach))
}

function barometerOf(state: AuthorityState, playerId: string): BarometerWarning[] | null {
  const reach = reachOwnedOf(state, playerId, HAZARD_BAROMETER)
  return reach === null ? null : barometerWarningsOf(state, playerId, reach)
}

/** The passive's reach at the player's Mark; null when the player does not own it. */
function reachOwnedOf(state: AuthorityState, playerId: string, itemId: string): number | null {
  const item = sensingItemOf(itemId)
  if (item === null || !ownsItem(state, playerId, itemId)) return null
  return passiveReachOf(item, researchedMarkOf(state, playerId, itemId))
}

function nearestReadingsOf(
  state: AuthorityState,
  playerId: string,
  readings: readonly AssayReading[],
): AssayReading[] {
  const pose = state.players[playerId].vehicle.pose
  if (pose === null) return []
  const at = tileOfPose(pose)
  return [...readings]
    .sort((a, b) => distanceSqOf(a.tile, at) - distanceSqOf(b.tile, at))
    .slice(0, LENS_CARD_CAP)
}

function distanceSqOf(a: TilePoint, b: TilePoint): number {
  const dx = a.tx - b.tx
  const dy = a.ty - b.ty
  return dx * dx + dy * dy
}
