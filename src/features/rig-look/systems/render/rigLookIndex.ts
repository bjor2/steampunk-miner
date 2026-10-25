/**
 * Where a track's owned purchase count sits on its look ladder (#577; re-keyed onto the
 * power-decade bands by ticket 809, VS ruling of 24 Oct 14:58): the count falls in band
 * floor(n / step); below the first edge the rig shows its base look, on the authored bands their
 * step, and past the authored art a finish cycled once a band with pips counting decades of power
 * (`rigLookBands.ts`). The only inputs are a track's rows and its owned count `n` (HS on #157):
 * never a stat, a price, the planet, a tick or a random draw, which is why this module imports
 * nothing from authority, economy or planet code. Integer maths only, so any count up to 2^31 - 1
 * answers the same on every client.
 */
import { bandAt, bandPipsOf } from './rigLookBands'

/** One named look step: a part swapped onto the track's slot and its placeholder glow (T1). */
export interface RigLookStepRow {
  /** The owned purchase count from which this step shows: its band's edge (ticket 809). */
  from: number
  /** The part drawn on the track's slot from this step, null while the art is not in (T2-T6). */
  part: string | null
  /**
   * The asset `part` is cut from (ticket 640): one of the table's `lookAssets`; absent is the
   * `vehicle` asset, whose tiered part then takes its own slot.
   */
  asset?: string
  /** Progression's band name, 3 words at most (`Fitting: {bandName}`), null for #554's rows. */
  card: string | null
  /** `#rrggbb` of the glow on the track's glow slots. */
  colour: string
  /** Added to each glow slot group's own glow, in `glowSlots` order. */
  glows: readonly number[]
}

/**
 * A track's bands (ticket 809): `step` purchases each, by the VS rule from the line's decade step
 * and the bot's two-planet buys, both frozen here from the baseline trace with the edges they give.
 */
export interface RigLookBand {
  /** Purchases that raise the line's power tenfold (`decadeStepOf` its economy.json ratio). */
  decadeStep: number
  /** The median buys of the line over 2 planets on the bot path the edges were frozen from. */
  twoPlanetBuys: number
  /** Purchases a band: `bandStepOf(decadeStep, twoPlanetBuys)`. */
  step: number
  /** The bands' first counts to about P40 on the median path: step, 2 step, ...; authored or not. */
  edges: readonly number[]
  /** Finish ids (the table's `finishes`) cycled once a band past the authored steps. */
  finishes: readonly string[]
}

/** One finish a band past the art wears (ticket 809): a material, never a colour alone. */
export interface RigLookFinish {
  /** The hover line's band name, 3 words at most. */
  name: string
  /** `#rrggbb` of the material and of the glow on the track's glow slots. */
  colour: string
  /** 0 to 1, as three's standard material reads it. */
  metalness: number
  /** 0 to 1. */
  roughness: number
}

/** A track's upgrade plaque templates (ticket 585), as `rigLook.json` holds them. */
export interface RigLookPlaque {
  /** The fact on an authored step; `{bandName}` is the owned step's `card`. */
  step: string
  /** The fact past the authored steps; `{bandName}` the finish's name, `{level}` the count. */
  tail: string
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
  /**
   * Item ids whose own #166 art the track's look parts stand for (ticket 892, GD lock on #623):
   * while a step's part shows, those items' mounts draw nothing and their point does not make the
   * part yield. A track may cover its own item; absent covers none.
   */
  covers?: readonly string[]
  /**
   * The upgrade plaque's fitting fact templates (ticket 585); absent, the plaque keeps its facts.
   */
  plaque?: RigLookPlaque
  /** Part slot groups (`slotOfPartId`) the glows land on, one glow per group. */
  glowSlots: readonly (readonly string[])[]
  /** The cap (a key of the table's `glowCaps`) every glow of the track stays below. */
  glowCap: string
  /** The authored steps, one on each of the first edges. */
  steps: readonly RigLookStepRow[]
  band: RigLookBand
}

export interface RigLookIndex {
  /** The band the count sits in, 0 below the first edge. */
  band: number
  /** Authored steps reached, 0 (base look) to the number of steps. */
  step: number
  /** Finish bands past the authored steps, 0 below and on the top step. */
  tail: number
  /** Decades of power the finish band shows as pips, 0 on an authored band. */
  pips: number
}

/** 2^31 - 1: the largest count the look reads; a count above it shows its look. */
export const LARGEST_LOOK_PURCHASES = 2147483647

/** `n` as a whole count in 0 to 2^31 - 1; NaN, negatives and non-numbers read as 0. */
export function lookPurchasesOf(n: number): number {
  if (!(n > 0)) return 0
  return Math.min(Math.floor(n), LARGEST_LOOK_PURCHASES)
}

/** The band, step, tail and pips `n` owned purchases reach on `rows`. */
export function rigLookIndexOf(rows: TrackLookRows, n: number): RigLookIndex {
  const purchases = lookPurchasesOf(n)
  const band = bandAt(rows.band.step, purchases)
  const step = Math.min(band, rows.steps.length)
  return { band, step, tail: band - step, pips: finishPipsOf(rows, band, step) }
}

/** Steps reached at a clamped count (`lookPurchasesOf`); allocates nothing, for the frame loop. */
export function rigLookStepAt(rows: TrackLookRows, purchases: number): number {
  return Math.min(bandAt(rows.band.step, purchases), rows.steps.length)
}

/** Finish bands past the authored steps at a clamped count that has reached `step`. */
export function rigLookTailAt(rows: TrackLookRows, step: number, purchases: number): number {
  return bandAt(rows.band.step, purchases) - step
}

/** An authored band shows its art, no pips; a finish band the decades at its start. */
function finishPipsOf(rows: TrackLookRows, band: number, step: number): number {
  if (band === step) return 0
  return bandPipsOf(rows.band.step, rows.band.decadeStep, band)
}

export function topStepOf(rows: TrackLookRows): RigLookStepRow {
  return rows.steps[rows.steps.length - 1]
}
