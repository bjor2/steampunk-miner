/**
 * Where a track's owned purchase count sits on its look ladder (#577, TD shape on the ticket; G&V
 * spec on #157, GD lock 6300553486): below the first step the rig shows its base look; from each
 * step's `from` on, that step; from the top step on, a linear tail of one look step per `delta`
 * purchases, s = (n - n_top) / delta, with no cap. The only inputs are a track's rows and its
 * owned count `n` (HS on #157): never a stat, a price, the planet, a tick or a random draw, which is
 * why this module imports nothing from authority, economy or planet code. Integer maths only, so
 * any count up to 2^31 - 1 answers the same on every client.
 */

/** One named look step: a part swapped onto the track's slot and its placeholder glow (T1). */
export interface RigLookStepRow {
  /** The owned purchase count from which this step shows; integers rising from 1. */
  from: number
  /** The part drawn on the track's slot from this step, null while the art is not in (T2-T6). */
  part: string | null
  /**
   * The asset `part` is cut from (ticket 640): one of the table's `lookAssets`; absent is the
   * `vehicle` asset, whose tiered part then takes its own slot.
   */
  asset?: string
  /** Progression's step name for the card line (`Fitting: {card}`), null for #554's rows. */
  card: string | null
  /** `#rrggbb` of the glow on the track's glow slots. */
  colour: string
  /** Added to each glow slot group's own glow, in `glowSlots` order. */
  glows: readonly number[]
}

/** The bounded ladders the tail walks, one entry each per look step (mixed radix). */
export interface RigLookTail {
  /** Purchases per tail step; the GD ruled 1 (every purchase visible). */
  delta: number
  /** `#rrggbb`, changes every tail step. */
  palette: readonly string[]
  /** A plating finish id, changes once per lap of the palette. */
  plating: readonly string[]
  /** One glow per glow slot group, changes once per lap of palette and plating. */
  glow: readonly (readonly number[])[]
}

/** One track's look rows, as `rigLook.json` holds them. */
export interface TrackLookRows {
  /** An upgrade track id (`UPGRADE_IDS`), checked when the table loads. */
  track: string
  /** The one vehicle-attach point the track's parts swap on. */
  slot: string
  /**
   * The `vehicle` part slot (`boiler`) a look part of another asset stands in place of, hidden
   * while it shows (ticket 640); absent, the look lies over the rig and hides nothing.
   */
  replaces?: string
  /** Part slot groups (`slotOfPartId`) the glows land on, one glow per group. */
  glowSlots: readonly (readonly string[])[]
  /** The cap (a key of the table's `glowCaps`) every glow of the track stays below. */
  glowCap: string
  steps: readonly RigLookStepRow[]
  tail: RigLookTail
}

export interface RigLookIndex {
  /** Steps reached, 0 (base look) to the number of steps. */
  step: number
  /** Tail steps past the top step, 0 below and on it. */
  tail: number
}

/** 2^31 - 1: the largest count the look reads; a count above it shows its look. */
export const LARGEST_LOOK_PURCHASES = 2147483647

/** `n` as a whole count in 0 to 2^31 - 1; NaN, negatives and non-numbers read as 0. */
export function lookPurchasesOf(n: number): number {
  if (!(n > 0)) return 0
  return Math.min(Math.floor(n), LARGEST_LOOK_PURCHASES)
}

/** The step and tail index `n` owned purchases reach on `rows`. */
export function rigLookIndexOf(rows: TrackLookRows, n: number): RigLookIndex {
  const purchases = lookPurchasesOf(n)
  const step = rigLookStepAt(rows, purchases)
  return { step, tail: rigLookTailAt(rows, step, purchases) }
}

/** Steps reached at a clamped count (`lookPurchasesOf`); allocates nothing, for the frame loop. */
export function rigLookStepAt({ steps }: TrackLookRows, purchases: number): number {
  let reached = 0
  while (reached < steps.length && purchases >= steps[reached].from) reached++
  return reached
}

/** Tail steps at a clamped count that has reached `step`; allocates nothing. */
export function rigLookTailAt(rows: TrackLookRows, step: number, purchases: number): number {
  if (step < rows.steps.length) return 0
  return Math.floor((purchases - topStepOf(rows).from) / rows.tail.delta)
}

export function topStepOf(rows: TrackLookRows): RigLookStepRow {
  return rows.steps[rows.steps.length - 1]
}
