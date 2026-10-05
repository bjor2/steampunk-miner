/**
 * The artefact cache's commands (decision #46 and its Game Director / Technical Director
 * amendments):
 *
 *   OpenArtefactCache        undocked, active, overlapping the planet's cache, holding nothing
 *                            -> artefact_open; the three cards are client UI
 *   ChooseArtefact {optionId} the same checks, then the pick is held for good -> artefact_chosen
 *
 * The slice holds at most one artefact, so a player who holds one finds every cache inert: both
 * commands are refused with `artefact_unavailable` and nothing is logged as an open. Closing the
 * cards without a pick sends nothing, so the cache stays live. Whether a cache is live is read
 * from the held artefact here, never from the ground, so the world and its digests stay the same
 * whatever anyone chose.
 */
import { ARTEFACT_CACHE_OVERLAP_MM } from '../../constants/balance'
import { MM_PER_METRE } from '../../constants/physics'
import { ARTEFACT_ID, isArtefactId, type ArtefactId } from '../artefacts/artefactOptions'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { artefactCacheTile } from '../world/artefactCache'
import type { TilePoint } from '../world/tileGrid'
import { vehicleOf, withArtefact, type AuthorityState } from './authorityState'
import {
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import type { HeldArtefact } from './heldArtefact'
import { noPlanetRejection, planetParamsOf } from './planetOfState'

export const ARTEFACT_RULES: {
  readonly openArtefactCache: CommandRule<'openArtefactCache'>
  readonly chooseArtefact: CommandRule<'chooseArtefact'>
} = {
  openArtefactCache: {
    fields: {},
    reject: (state, { playerId }) => cacheOpenRefusal(state, playerId),
    apply: (state) => openCache(state),
  },
  chooseArtefact: {
    fields: { optionId: 'text' },
    reject: (state, { playerId, payload }) =>
      firstRejection([
        () => unknownArtefactRejection(payload.optionId),
        () => cacheOpenRefusal(state, playerId),
      ]),
    apply: (state, { playerId, payload }) =>
      takeArtefact(state, playerId, payload.optionId as ArtefactId),
  },
}

/** A scenario's held artefact: as if chosen from this planet's cache, with no log of a pick. */
export const ARTEFACT_DEBUG_RULES: {
  readonly 'debug.setArtefact': CommandRule<'debug.setArtefact'>
} = {
  'debug.setArtefact': {
    fields: { optionId: 'text' },
    reject: (state, { payload }) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => unknownArtefactRejection(payload.optionId),
      ]),
    apply: (state, { playerId, payload }) => ({
      state: withArtefact(state, playerId, heldArtefactOf(payload.optionId as ArtefactId, state)),
      events: [],
    }),
  },
}

/** Why `interact` would not open the cache now; null when it would (the HUD prompt shows then). */
export function cacheOpenRefusal(state: AuthorityState, playerId: string): Rejection | null {
  const vehicle = vehicleOf(state, playerId)
  return firstRejection([
    () => noPlanetRejection(state.planet),
    () => (vehicle.mode === 'active' ? null : notActiveRejection(vehicle.mode)),
    () => overlapRejection(state, vehicle.pose),
    () => heldArtefactRejection(state.players[playerId].artefact),
  ])
}

export function canOpenArtefactCache(state: AuthorityState, playerId: string): boolean {
  return cacheOpenRefusal(state, playerId) === null
}

/** Docking starts a new dock cycle: a spent `breathing_room` brace is ready again (#46). */
export function restoreBreathingRoom(state: AuthorityState, playerId: string): RuleEffect {
  const held = state.players[playerId].artefact
  if (held?.id !== ARTEFACT_ID.breathingRoom || held.breathingRoomCharges === 1) {
    return unchanged(state)
  }
  return { state: withArtefact(state, playerId, { ...held, breathingRoomCharges: 1 }), events: [] }
}

function notActiveRejection(mode: string): Rejection {
  return rejectionOf('vehicle_not_active', `the vehicle is ${mode}`)
}

function overlapRejection(state: AuthorityState, pose: VehiclePose | null): Rejection | null {
  if (pose !== null && isOverlappingTile(pose, cacheTileOf(state))) return null
  return rejectionOf('out_of_reach', 'the vehicle is not over the artefact cache')
}

function heldArtefactRejection(held: HeldArtefact | null): Rejection | null {
  if (held === null) return null
  return rejectionOf('artefact_unavailable', `the cache is inert: ${held.id} is already held`)
}

function unknownArtefactRejection(optionId: string): Rejection | null {
  if (isArtefactId(optionId)) return null
  return rejectionOf('unknown_artefact', `${JSON.stringify(optionId)} is not an artefact option`)
}

/** Body centre within the overlap distance of the cell centre on both axes. */
function isOverlappingTile(pose: VehiclePose, tile: TilePoint): boolean {
  const dx = Math.abs(tile.tx * MM_PER_METRE + MM_PER_METRE / 2 - pose.x)
  const dy = Math.abs(tile.ty * MM_PER_METRE + MM_PER_METRE / 2 - pose.y)
  return dx <= ARTEFACT_CACHE_OVERLAP_MM && dy <= ARTEFACT_CACHE_OVERLAP_MM
}

/** Called after `noPlanetRejection` passed, so the planet has params. */
function cacheTileOf(state: AuthorityState): TilePoint {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('the artefact cache needs a generated planet')
  return artefactCacheTile(params)
}

function openCache(state: AuthorityState): RuleEffect {
  return { state, events: [{ type: 'ArtefactCacheOpened', ...cacheTileOf(state) }] }
}

function takeArtefact(state: AuthorityState, playerId: string, id: ArtefactId): RuleEffect {
  return {
    state: withArtefact(state, playerId, heldArtefactOf(id, state)),
    events: [{ type: 'ArtefactChosen', optionId: id }],
  }
}

/** A fresh pick: `breathing_room` starts with its brace ready. */
function heldArtefactOf(id: ArtefactId, state: AuthorityState): HeldArtefact {
  return {
    id,
    fromPlanet: state.planet.index,
    breathingRoomCharges: id === ARTEFACT_ID.breathingRoom ? 1 : 0,
  }
}
