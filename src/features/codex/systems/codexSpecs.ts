/** Spec fixtures shared by the codex specs. */
import type { UnlockProgress } from '../../../systems/unlocks/unlockSchedule'

/** A run that reached `highestPlanetIndex` and nothing else: what the kernel fallback reads. */
export function progressTo(highestPlanetIndex: number): UnlockProgress {
  return {
    highestPlanetIndex,
    collectedArtefactRowIds: new Set(),
    builtFacilityRowIds: new Set(),
    manualUnlockRowIds: new Set(),
  }
}
