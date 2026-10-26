/**
 * The rig look's item tracks (ticket 623; GD lock of 21 Oct and its 25 Oct lock on #623, TD
 * ruling 6307937801): a drill type is a #577 track keyed by its item id, so its look is a pure
 * function of (track, n) like every other track's, never saved. `n` is 0 while the item is not
 * equipped and its owned Mark while it is (`rigItemLookCounts.ts`); a one-off reads 1. Each step
 * swaps its parts in from one look asset on the track's point, standing in the `vehicle` slot it
 * `replaces`; past the top step the top step holds, so a Mark of a million draws as many parts as
 * the top Mark, with no walk over n. An item track paints no glow of its own: the drill-level
 * step of the upgrade track sharing its point is the tint on its parts (that track's glow slots
 * name them), so drill progress stays visible on the type's head.
 */
import type { RigLookFrame } from './rigLookFrames'
import { lookPurchasesOf } from './rigLookIndex'

/** The item counts while it sits in any loadout slot, whatever its toggle says. */
export const SLOTTED_EQUIP = 'slotted'
/** The item counts while its lane's fork has its branch active. */
export const FORK_EQUIP = 'fork'

/** How an item track's item counts as equipped: slotted in any loadout slot, or a fork branch. */
export interface RigItemEquip {
  /** `slotted` (the toggle never matters) or `fork` (while `lane`'s fork has `branch` active). */
  kind: string
  lane?: string
  branch?: string
}

/** A later Mark: an owned item that raises the track's `n` to `mark` while it is equipped. */
export interface RigItemMark {
  mark: number
  itemId: string
}

/** One step of an item track: the parts it swaps in from `n = from`. */
export interface RigItemLookStepRow {
  from: number
  /** Part ids of `asset`, every one drawn; the first names the step in reads. */
  parts: readonly string[]
  /** One of the table's `lookAssets`. */
  asset: string
}

/** One item track's look rows, as `rigLook.json`'s `itemTracks` holds them. */
export interface RigItemLookRows {
  /** The item id (`gear.twin_bit`): the track's key. */
  track: string
  equip: RigItemEquip
  /** Mark 2 and on, rising; absent, an equipped item reads Mark 1. */
  marks?: readonly RigItemMark[]
  /** The vehicle-attach point its parts swap on. */
  slot: string
  /** The `vehicle` part slot its parts stand in place of, hidden while they show. */
  replaces?: string
  /** Items whose own #166 art its parts stand for while they show (ticket 892). */
  covers?: readonly string[]
  /** Rising from `n = 1`, so an equipped item always shows a step. */
  steps: readonly RigItemLookStepRow[]
}

export interface RigItemLookFrames {
  rows: RigItemLookRows
  base: RigLookFrame
  /** `steps[k - 1]` shows from step k. */
  steps: readonly RigLookFrame[]
}

const NO_PARTS: readonly string[] = []
const NO_COVERS: readonly string[] = []
const NO_GLOWS: readonly number[] = []

export function createItemLookFrames(rows: RigItemLookRows): RigItemLookFrames {
  return {
    rows,
    base: itemFrameOf(rows, 0, null),
    steps: rows.steps.map((step, at) => itemFrameOf(rows, at + 1, step)),
  }
}

/** The kept look `n` shows: the last step reached, the base below the first. */
export function itemLookFrameAt(frames: RigItemLookFrames, n: number): RigLookFrame {
  const step = itemStepAt(frames.rows, lookPurchasesOf(n))
  return step === 0 ? frames.base : frames.steps[step - 1]
}

/** Steps reached at `n`: a walk over the authored steps, never over n. */
function itemStepAt(rows: RigItemLookRows, n: number): number {
  let reached = 0
  for (const step of rows.steps) if (step.from <= n) reached++
  return reached
}

function itemFrameOf(
  rows: RigItemLookRows,
  step: number,
  row: RigItemLookStepRow | null,
): RigLookFrame {
  return {
    track: rows.track,
    step,
    partId: row?.parts[0] ?? null,
    partIds: row?.parts ?? NO_PARTS,
    assetId: row?.asset ?? null,
    slot: rows.slot,
    replacesSlot: row === null ? null : (rows.replaces ?? null),
    covers: row === null ? NO_COVERS : (rows.covers ?? NO_COVERS),
    tint: null,
    glows: NO_GLOWS,
    finish: null,
    bandName: null,
  }
}
