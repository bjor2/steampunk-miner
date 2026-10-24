/**
 * The glint a band crossing plays (ticket 809; Progression on #647): a purchase that takes a track
 * into a new band lights that track's glow slots once, fading to nothing over the glint's ticks,
 * on the rig and so on the car the Outfitter shows beside its sheet. A purchase inside a band
 * plays nothing, so a held chain glints only where the look changes. The looks are made once per
 * track and kept, so a frame allocates nothing; render-only, never in state, a save or a digest.
 */
import type { VehicleLook, VehicleLookFlash } from '../../../../systems/registries/vehicleLooks'
import { rigLookIndexOf, type TrackLookRows } from './rigLookIndex'

/** A one-off glow on the purchase that crosses a band (`rigLook.json`'s `glint`). */
export interface RigLookGlint {
  /** Ticks it plays for, fading to nothing. */
  ticks: number
  /** `#rrggbb`. */
  colour: string
  /** Added to the slots' glow at its first tick. */
  glow: number
}

/** Whether buying from `fromLevel` to `toLevel` takes the track into another band. */
export function isBandCrossing(rows: TrackLookRows, fromLevel: number, toLevel: number): boolean {
  return rigLookIndexOf(rows, fromLevel).band !== rigLookIndexOf(rows, toLevel).band
}

/** The track's glint as a kept flash: one look per tick, its glow falling to 0 by the last. */
export function createGlintFlash(rows: TrackLookRows, glint: RigLookGlint): VehicleLookFlash {
  const looks = Array.from({ length: glint.ticks }, (_, age) => glintLookAt(rows, glint, age))
  return { ticks: glint.ticks, lookAt: (age) => looks[age] ?? null }
}

function glintLookAt(rows: TrackLookRows, glint: RigLookGlint, age: number): VehicleLook {
  const glow = (glint.glow * (glint.ticks - age)) / glint.ticks
  return {
    tint: null,
    opacity: 1,
    outline: null,
    glows: rows.glowSlots.map((slots) => ({ slots, colour: glint.colour, glow })),
  }
}
