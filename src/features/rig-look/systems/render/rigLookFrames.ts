/**
 * The looks a track's ladder can show (#577), each made once and kept: the base look, one per
 * authored step, and one lap of finishes. Past the authored art every band wears the next finish of
 * the track's cycle (ticket 809: the tint-only linear tail replaced by a finish cycle on the band
 * period), over the top step's part, so neighbouring bands always differ in material and a track
 * holds at most K + 1 + F looks, whatever the count; its pips (`RigLookIndex.pips`) count the
 * decades of power and are drawn beside it. Asked every frame: `lookFrameAt` allocates nothing. A
 * frame's part and asset are a pure function of (track, n), never saved (ticket 640).
 */
import {
  lookPurchasesOf,
  type RigLookFinish,
  rigLookStepAt,
  rigLookTailAt,
  topStepOf,
  type RigLookStepRow,
  type TrackLookRows,
} from './rigLookIndex'

/** The asset a step's part comes from when its row names none (the swap's default, ticket 640). */
export const VEHICLE_LOOK_ASSET_ID = 'vehicle'

const NO_COVERS: readonly string[] = []

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
  /** The items whose own art the part stands for (ticket 892); none with no part. */
  covers: readonly string[]
  /** `#rrggbb` of the glow on the track's glow slots, null for the base look. */
  tint: string | null
  /** One glow per glow slot group; zeros on the base look. */
  glows: readonly number[]
  /** The finish id (the table's `finishes`) past the authored steps, null on them. */
  finish: string | null
  /** The band's name for the hover line: the step's card or the finish's name; null for none. */
  bandName: string | null
}

export interface TrackLookFrames {
  rows: TrackLookRows
  base: RigLookFrame
  /** `steps[k - 1]` shows from step k. */
  steps: readonly RigLookFrame[]
  /** Tail step t (from 1) shows `lap[(t - 1) mod lap length]`. */
  lap: readonly RigLookFrame[]
}

/** The finishes a table names, by id. */
export type RigLookFinishes = Readonly<Record<string, RigLookFinish>>

export function createTrackLookFrames(
  rows: TrackLookRows,
  finishes: RigLookFinishes,
): TrackLookFrames {
  return {
    rows,
    base: baseFrameOf(rows),
    steps: rows.steps.map((row, at) => stepFrameOf(rows, row, at + 1)),
    lap: rows.band.finishes.map((id) => finishFrameOf(rows, id, finishes[id])),
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
    covers: NO_COVERS,
    tint: null,
    glows: rows.glowSlots.map(() => 0),
    finish: null,
    bandName: null,
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
    covers: coversOf(rows, row),
    tint: row.colour,
    glows: row.glows,
    finish: null,
    bandName: row.card,
  }
}

/** A finish band: the top step's part and glows in the finish's colour. */
function finishFrameOf(rows: TrackLookRows, id: string, finish: RigLookFinish): RigLookFrame {
  const top = topStepOf(rows)
  return {
    ...stepFrameOf(rows, top, rows.steps.length),
    tint: finish.colour,
    finish: id,
    bandName: finish.name,
  }
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

/** A step with no part swaps nothing in, so it stands for no item's art. */
function coversOf(rows: TrackLookRows, row: RigLookStepRow): readonly string[] {
  return row.part === null ? NO_COVERS : (rows.covers ?? NO_COVERS)
}
