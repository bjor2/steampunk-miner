/**
 * The rig look on the kernel vehicle (#577, through `vehicleLooks`, ticket 389): one source per
 * track row block, id `rig-look.<track>`, so a track added to the table paints with no code. Each
 * reads only `players[playerId].vehicle.levels[track]`, the owned purchase count the vehicle
 * snapshot already carries (HS on #157): no stat, price, planet or local-player read, so any
 * client can paint any player's rig. The look is the frame's colour and glows on the track's glow
 * slots; never a tint over the whole car, so a fitted module's part keeps its own look. Read-only
 * on the state; no flash, no event, no save key.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { VehicleLook, VehicleLookSource } from '../../../systems/registries/vehicleLooks'
import {
  everyLookFrameOf,
  lookFrameAt,
  type RigLookFrame,
  type TrackLookFrames,
} from './render/rigLookFrames'
import { SHIPPED_RIG_LOOKS, type RigLooks } from './rigLooks'

export const RIG_LOOK_SOURCE_PREFIX = 'rig-look.'

/** One source per track in `looks`, in table order. */
export function createRigLookSources(looks: RigLooks = SHIPPED_RIG_LOOKS): VehicleLookSource[] {
  return looks.tracks.map(createTrackLookSource)
}

export function rigLookSourceIdOf(track: string): string {
  return `${RIG_LOOK_SOURCE_PREFIX}${track}`
}

/** What `playerId`'s rig shows on the track; the base look for a player not in the state. */
export function rigLookOfPlayer(
  frames: TrackLookFrames,
  state: AuthorityState,
  playerId: string,
): RigLookFrame {
  return lookFrameAt(frames, ownedPurchasesOf(state, playerId, frames.rows.track))
}

/** The stored level is the purchase count (#552), 0 for a player or a track not in the state. */
export function ownedPurchasesOf(state: AuthorityState, playerId: string, track: string): number {
  const levels: Readonly<Record<string, number | undefined>> | undefined =
    state.players[playerId]?.vehicle.levels
  return levels?.[track] ?? 0
}

function createTrackLookSource(frames: TrackLookFrames): VehicleLookSource {
  const looks = keepLooksOf(frames)
  return {
    id: rigLookSourceIdOf(frames.rows.track),
    lookOf: (state, playerId) => looks.get(rigLookOfPlayer(frames, state, playerId)) ?? null,
    flashOf: () => null,
  }
}

/** Every frame's look made once, as the kernel asks for kept looks. */
function keepLooksOf(frames: TrackLookFrames): Map<RigLookFrame, VehicleLook | null> {
  return new Map(everyLookFrameOf(frames).map((frame) => [frame, lookOfFrame(frames, frame)]))
}

function lookOfFrame(frames: TrackLookFrames, frame: RigLookFrame): VehicleLook | null {
  if (frame.tint === null) return null
  const colour = frame.tint
  return {
    tint: null,
    opacity: 1,
    outline: null,
    glows: frames.rows.glowSlots.map((slots, at) => ({ slots, colour, glow: frame.glows[at] })),
  }
}
