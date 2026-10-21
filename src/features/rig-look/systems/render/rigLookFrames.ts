/**
 * The looks a track's ladder can show (#577), each made once and kept: the base look, one per named
 * step, and one lap of the tail. The tail is a mixed-radix walk over its bounded ladders (TD shape):
 * the tint moves every tail step, the plating once per lap of the palette, the glow once per lap of
 * both, so neighbouring counts always differ and a track holds at most K + 1 + P x L x G looks,
 * whatever the count. Tail step 0 is the top step itself, so #554's rows paint exactly as before up
 * to their last threshold. Asked every frame: `lookFrameAt` allocates nothing. A frame's part and
 * asset are a pure function of (track, n), never saved (ticket 640).
 */
import {
  lookPurchasesOf,
  rigLookStepAt,
  rigLookTailAt,
  topStepOf,
  type RigLookStepRow,
  type TrackLookRows,
} from './rigLookIndex'

/** The asset a step's part comes from when its row names none (the swap's default, ticket 640). */
export const VEHICLE_LOOK_ASSET_ID = 'vehicle'

/** What a track's slot shows at one look step. */
export interface RigLookFrame {
  track: string
  /** Steps reached, 0 for the base look. */
  step: number
  /** The part swapped onto `slot`, null for the base part (or a step whose art is not in). */
  partId: string | null
  /** The asset `partId` is cut from (`vehicle` unless the row names one), null with no part. */
  assetId: string | null
  slot: string
  /** The `vehicle` part slot a look part of another asset hides, null for none. */
  replacesSlot: string | null
  /** `#rrggbb` of the glow on the track's glow slots, null for the base look. */
  tint: string | null
  /** One glow per glow slot group; zeros on the base look. */
  glows: readonly number[]
  /** The plating finish id, null below the tail. */
  plating: string | null
}

export interface TrackLookFrames {
  rows: TrackLookRows
  base: RigLookFrame
  /** `steps[k - 1]` shows from step k. */
  steps: readonly RigLookFrame[]
  /** Tail step t (from 1) shows `lap[(t - 1) mod lap length]`. */
  lap: readonly RigLookFrame[]
}

export function createTrackLookFrames(rows: TrackLookRows): TrackLookFrames {
  return {
    rows,
    base: baseFrameOf(rows),
    steps: rows.steps.map((row, at) => stepFrameOf(rows, row, at + 1)),
    lap: tailLapOf(rows),
  }
}

/** The kept look `n` owned purchases show. */
export function lookFrameAt(frames: TrackLookFrames, n: number): RigLookFrame {
  const purchases = lookPurchasesOf(n)
  const step = rigLookStepAt(frames.rows, purchases)
  if (step === 0) return frames.base
  const tail = rigLookTailAt(frames.rows, step, purchases)
  if (tail === 0) return frames.steps[step - 1]
  return frames.lap[(tail - 1) % frames.lap.length]
}

/** Every look the track can show: base, steps, then one tail lap. */
export function everyLookFrameOf(frames: TrackLookFrames): readonly RigLookFrame[] {
  return [frames.base, ...frames.steps, ...frames.lap]
}

function baseFrameOf(rows: TrackLookRows): RigLookFrame {
  return {
    track: rows.track,
    step: 0,
    partId: null,
    assetId: null,
    slot: rows.slot,
    replacesSlot: null,
    tint: null,
    glows: rows.glowSlots.map(() => 0),
    plating: null,
  }
}

function stepFrameOf(rows: TrackLookRows, row: RigLookStepRow, step: number): RigLookFrame {
  return {
    track: rows.track,
    step,
    partId: row.part,
    assetId: assetIdOf(row),
    slot: rows.slot,
    replacesSlot: replacesSlotOf(rows, row),
    tint: row.colour,
    glows: row.glows,
    plating: null,
  }
}

/** Lap entry i: tint i mod P, plating floor(i / P) mod L, glow floor(i / (P x L)) mod G. */
function tailLapOf(rows: TrackLookRows): RigLookFrame[] {
  const { palette, plating, glow } = rows.tail
  const lapLength = palette.length * plating.length * glow.length
  return Array.from({ length: lapLength }, (_, at) => ({
    track: rows.track,
    step: rows.steps.length,
    partId: topStepOf(rows).part,
    assetId: assetIdOf(topStepOf(rows)),
    slot: rows.slot,
    replacesSlot: replacesSlotOf(rows, topStepOf(rows)),
    tint: palette[at % palette.length],
    glows: glow[Math.floor(at / (palette.length * plating.length)) % glow.length],
    plating: plating[Math.floor(at / palette.length) % plating.length],
  }))
}

function assetIdOf(row: RigLookStepRow): string | null {
  return row.part === null ? null : (row.asset ?? VEHICLE_LOOK_ASSET_ID)
}

/** Only another asset's part hides a slot: a `vehicle` part takes its own. */
function replacesSlotOf(rows: TrackLookRows, row: RigLookStepRow): string | null {
  const assetId = assetIdOf(row)
  if (assetId === null || assetId === VEHICLE_LOOK_ASSET_ID) return null
  return rows.replaces ?? null
}
