/**
 * The fire tile's feel from `fireTile.json` (ticket 314): how far a drag goes before it aims, and
 * the clank a refused shot plays. Presentation numbers only; nothing here reaches the authority.
 */
import type { SoundCue } from '../../../../systems/registries/soundCues'
import FIRE_TILE_FILE from '../../fireTile.json'

export interface FireTileFeel {
  /** A drag this far from the press, in CSS pixels, aims instead of firing. */
  dragAimPixels: number
  /** A press held this many ticks without a drag becomes a held, repeating gun. */
  holdFireTicks: number
  /** The clank of a blocked shot: any refusal but the recovery. */
  refusalClank: SoundCue
}

export const FIRE_TILE_FEEL: FireTileFeel = {
  dragAimPixels: FIRE_TILE_FILE.dragAimPixels,
  holdFireTicks: FIRE_TILE_FILE.holdFireTicks,
  refusalClank: FIRE_TILE_FILE.refusalClank as SoundCue,
}
