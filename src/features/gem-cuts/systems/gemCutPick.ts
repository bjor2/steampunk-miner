/**
 * Which cut each gem of a generated planet draws, and which overlay the planet lays over its gems
 * (ticket 889). Every pick hashes the planet's address seed (`planetSeedAt(worldSeed, s, p)`, the
 * TD architecture in the GD lock on #650) under this slice's own salt, so it is a function of the
 * world seed, the address and the gem's slot alone, never of the campaign index two addresses may
 * share, and never of the order the roster was read in. A gem's cut is a seeded walk over the cuts
 * its planet's ore rules stamp allows (`cutsUnder`), from the slot's draw to the first cut no
 * earlier gem of the planet took, so a planet's gems never share a sprite; the overlay is one
 * seeded draw over the kernel catalogue. Pure. Look only.
 */
import { hashCell } from '../../../systems/cellRandom'
import {
  GEM_OVERLAYS,
  type GemOverlay,
  type GemOverlayCatalogue,
} from '../../../systems/render/gemOverlays'
import { planetSeedAt } from '../../../systems/starMap/planetAddressSeed'
import { cutsUnder, GEM_CUT_LIBRARY, type GemCut, type GemCutLibrary } from './gemCutLibrary'

/** This slice's hash salts: apart from the roster streams of `solar-systems`, never reused. */
export const GEM_CUT_SALT = 889
export const GEM_OVERLAY_SALT = 8890

/** A generated planet's address. */
export interface PlanetAddress {
  worldSeed: number
  system: bigint
  place: bigint
}

/**
 * The cut of each gem slot, keyed by slot id, in the slots' order; empty when the planet's stamp
 * allows no cut (every gem keeps the shader look).
 */
export function planetGemCutsOf(
  address: PlanetAddress,
  gemSlots: readonly string[],
  oreRulesVersion: number | undefined,
  library: GemCutLibrary = GEM_CUT_LIBRARY,
): ReadonlyMap<string, string> {
  const allowed = cutsUnder(oreRulesVersion, library)
  const picks = new Map<string, string>()
  if (allowed.length === 0) return picks
  gemSlots.forEach((slot, at) => {
    picks.set(slot, freeCutFrom(allowed, slotDrawOf(address, at), new Set(picks.values())).id)
  })
  return picks
}

/** The overlay the planet lays over every gem it draws from the library. */
export function planetGemOverlayOf(
  address: PlanetAddress,
  catalogue: GemOverlayCatalogue = GEM_OVERLAYS,
): GemOverlay {
  const draw = hashCell(addressSeedOf(address), GEM_OVERLAY_SALT, 0)
  return catalogue.overlays[draw % catalogue.overlays.length]
}

function slotDrawOf(address: PlanetAddress, slotIndex: number): number {
  return hashCell(addressSeedOf(address), GEM_CUT_SALT, slotIndex)
}

function addressSeedOf({ worldSeed, system, place }: PlanetAddress): number {
  return planetSeedAt(worldSeed, system, place)
}

/** The first cut from the draw's start, wrapping, that no earlier gem of the planet took. */
function freeCutFrom(cuts: readonly GemCut[], draw: number, taken: ReadonlySet<string>): GemCut {
  for (let step = 0; step < cuts.length; step += 1) {
    const cut = cuts[(draw + step) % cuts.length]
    if (!taken.has(cut.id)) return cut
  }
  return cuts[draw % cuts.length]
}
