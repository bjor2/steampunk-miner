/**
 * The fire tile's feel from `fireTile.json` (ticket 314): how far a drag goes before it aims, the
 * lamp's long press, the tracer's spray counts and the clank a refused shot plays. Presentation
 * numbers only; nothing here reaches the authority.
 */
import type { SoundCue } from '../../../../systems/registries/soundCues'
import FIRE_TILE_FILE from '../../fireTile.json'

/** Spray pieces the bore throws: from the rig per shot, and from each cell it opens. */
export interface TracerLook {
  sparksPerShot: number
  debrisPerCell: number
  dustPerCell: number
}

export interface FireTileFeel {
  /** A drag this far from the press, in CSS pixels, aims instead of firing. */
  dragAimPixels: number
  /** A press held this many ticks without a drag becomes a held, repeating gun. */
  holdFireTicks: number
  /** A press held this many ticks on the tile's lamp toggles auto-shoot. */
  lampLongPressTicks: number
  tracer: TracerLook
  /** The clank of a blocked shot: any refusal but the recovery. */
  refusalClank: SoundCue
}

export const FIRE_TILE_FEEL: FireTileFeel = {
  dragAimPixels: FIRE_TILE_FILE.dragAimPixels,
  holdFireTicks: FIRE_TILE_FILE.holdFireTicks,
  lampLongPressTicks: FIRE_TILE_FILE.lampLongPressTicks,
  tracer: FIRE_TILE_FILE.tracer,
  refusalClank: FIRE_TILE_FILE.refusalClank as SoundCue,
}
