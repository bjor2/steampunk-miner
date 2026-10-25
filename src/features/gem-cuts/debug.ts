/** Read-only (feature-slices.md 3.14): the cuts and overlay an address draws, for eye checks. */
import type { DebugAction } from '../../debug/debugActionRegistry'
import type { DebugResult } from '../../debug/debugScreens'
import { readIndexText } from '../../systems/starMap/planetAddress'
import { ORE_RULES_VERSION } from '../../systems/world/planetParams'
import { planetGemCutsOf, planetGemOverlayOf } from './systems/gemCutPick'

/** The slots of the three gems a generated pool holds, as the read names them. */
const SAMPLE_SLOTS = ['gem-1', 'gem-2', 'gem-3']

export const gemCutsDebugActions: Readonly<Record<string, DebugAction>> = {
  cutsOf: (system: unknown, place: unknown, worldSeed: unknown) =>
    cutsOfAddress(system, place, worldSeed),
}

function cutsOfAddress(
  system: unknown,
  place: unknown,
  worldSeed: unknown,
): DebugResult<{ cuts: [string, string][]; overlay: string }> {
  const systemIndex = readIndexText(system)
  const placeIndex = readIndexText(place)
  if (systemIndex === null || placeIndex === null || typeof worldSeed !== 'number') {
    return { ok: false, problems: ['system and place are index texts, worldSeed a number'] }
  }
  const address = { worldSeed, system: systemIndex, place: placeIndex }
  return {
    ok: true,
    cuts: [...planetGemCutsOf(address, SAMPLE_SLOTS, ORE_RULES_VERSION)],
    overlay: planetGemOverlayOf(address).id,
  }
}
