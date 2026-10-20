/**
 * Every track's look ladder, made once from a checked table (#577): the one per-track registry the
 * vehicle look sources, the part swaps and the debug read all ask. `rigLookOf` is the shipped
 * table's answer for a track and an owned purchase count, nothing else.
 */
import {
  createTrackLookFrames,
  lookFrameAt,
  type RigLookFrame,
  type TrackLookFrames,
} from './render/rigLookFrames'
import { RIG_LOOK_TABLE } from './rigLookTable'
import type { RigLookTable } from './rigLookTableChecks'

export interface RigLooks {
  /** In table order. */
  tracks: readonly TrackLookFrames[]
}

export function createRigLooks(table: RigLookTable): RigLooks {
  return { tracks: table.tracks.map(createTrackLookFrames) }
}

export const SHIPPED_RIG_LOOKS: RigLooks = createRigLooks(RIG_LOOK_TABLE)

/** The track's ladder, null for a track the table has no rows for. */
export function trackLookFramesOf(looks: RigLooks, track: string): TrackLookFrames | null {
  return looks.tracks.find((frames) => frames.rows.track === track) ?? null
}

/** What `n` owned purchases on `track` show, from the shipped table; null for a track it lacks. */
export function rigLookOf(track: string, n: number): RigLookFrame | null {
  const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, track)
  return frames === null ? null : lookFrameAt(frames, n)
}
