/**
 * The one cell an ore patch paints (decision #42, feature-slices.md 3.8): the lattice's roll, its
 * family and tier offset `band - 1`, after the slices' `patchContent` folds (the rarity lead, the
 * planet mix, the roster's kind slot).
 */
import { foldPatchContent } from '../registries/generationHooks'
import type { OrePatch } from './orePatches'
import type { PlanetParams } from './planetParams'
import { oreCell } from './worldCell'

export function patchCellOf(params: PlanetParams, patch: OrePatch): number {
  const rolled = { family: patch.family, tierOffset: patch.band - 1 }
  const content = foldPatchContent(params, patch, rolled)
  return oreCell(content.family, content.tierOffset, content.kindSlot)
}
