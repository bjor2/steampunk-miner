/**
 * What the terrain shader reads for the planet's gem cuts (ticket 889): from which act-wide atlas
 * cell on the hue-tinted library pages begin (`heroAtlas.ts`), so a sprite there is a neutral cut
 * the shader colours by its kind's hue, and the planet's overlay over the hue (`gemOverlays.ts`).
 * One `vec4`, `uGemCuts` (first hue-tinted cell, overlay pattern code, overlay strength, unused),
 * written by `scene/terrainKindLooks.ts` with the look table and never per frame. With no tinted
 * page the first cell sits past every cell the table can carry, so no sprite is tinted. Look only.
 */
import {
  gemOverlayLookOf,
  NO_GEM_OVERLAY_LOOK,
  type GemOverlay,
  type GemOverlayLook,
} from './gemOverlays'
import { HERO_LOOK_CELL_SPAN } from './kindLookTable'

export interface GemCutsLook {
  /** The act-wide cell the hue-tinted pages begin at; null for none resident. */
  firstHueTintedCell: number | null
  overlay: GemOverlayLook
}

/** A cell past every cell the look table can number: no sprite is at or after it. */
export const NO_HUE_TINTED_CELL = HERO_LOOK_CELL_SPAN

export const NO_GEM_CUTS_LOOK: GemCutsLook = {
  firstHueTintedCell: null,
  overlay: NO_GEM_OVERLAY_LOOK,
}

export function gemCutsLookOf(
  firstHueTintedCell: number | null,
  overlay: GemOverlay | null,
): GemCutsLook {
  return { firstHueTintedCell, overlay: gemOverlayLookOf(overlay) }
}

/** The `uGemCuts` vector: (first hue-tinted cell, overlay pattern code, overlay strength, 0). */
export function gemCutsVectorOf(look: GemCutsLook): [number, number, number, number] {
  return [
    look.firstHueTintedCell ?? NO_HUE_TINTED_CELL,
    look.overlay.patternCode,
    look.overlay.strength,
    0,
  ]
}

/** The look a written vector carries, for the debug read. */
export function gemCutsLookOfVector([
  first,
  patternCode,
  strength,
]: readonly number[]): GemCutsLook {
  return {
    firstHueTintedCell: first >= NO_HUE_TINTED_CELL ? null : first,
    overlay: { patternCode, strength },
  }
}
