/**
 * What the held artefact changes on screen (#46): `ore_whisper`'s rim glow while undocked, and
 * whether the planet's cache draws live or as a husk. Read from the authority each frame and
 * written into the terrain's uniforms; never part of a chunk, so no chunk is rebuilt for it.
 */
import { ARTEFACT_ID } from '../artefacts/artefactOptions'
import { cacheStateOf, type HeldArtefact } from '../authority/heldArtefact'
import type { VehicleMode } from '../vehicle/vehicleState'

export interface ArtefactLook {
  isOreWhispering: boolean
  isCacheLive: boolean
}

/** `ore_whisper` works while undocked (#46). */
export function isOreWhispering(held: HeldArtefact | null, mode: VehicleMode): boolean {
  return held?.id === ARTEFACT_ID.oreWhisper && mode !== 'docked'
}

/** A husk once the player holds any artefact; live while they hold none. */
export function isCacheLive(held: HeldArtefact | null, planetIndex: number): boolean {
  return cacheStateOf(held, planetIndex) === 'available'
}
