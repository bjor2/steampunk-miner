/**
 * Which cut each gem of a generated planet draws, and which overlay the planet lays over its gems
 * (ticket 889). Every pick hashes the planet's address seed (`planetSeedAt(worldSeed, s, p)`, the
 * TD architecture in the GD lock on #650) under this slice's own salt, so it is a function of the
 * world seed, the address and the gem's slot alone, never of the campaign index two addresses may
 * share, and never of the order the roster was read in. A gem's cut is a seeded walk over the cuts
 * its planet's ore rules stamp allows (`cutsUnder`), from the slot's draw to the first cut no
 * earlier gem of the planet took, so a planet's gems never share a sprite; the overlay is one
 * seeded draw over the kernel catalogue.
 *
 * From ore rules 15 (ticket 890, GD lock of 26 Oct, HS row 3) the overlay walks: the planets of
 * the look group, in place order, each take the first overlay from their own draw that no planet
 * before them took, so no two planets of an act lay one overlay. The walk reads the group's
 * addresses alone, never which of them were generated or visited, nor their stamps, and takes at
 * most one step per overlay; a group with more planets than overlays is refused, never given a
 * shared look. A planet stamped 14 keeps its one draw. Pure. Look only.
 */
import { hashCell } from '../../../systems/cellRandom'
import {
  GEM_OVERLAYS,
  type GemOverlay,
  type GemOverlayCatalogue,
} from '../../../systems/render/gemOverlays'
import { planetSeedAt } from '../../../systems/starMap/planetAddressSeed'
import { GEM_OVERLAY_WALK_ORE_RULES } from '../../../systems/world/planetParams'
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

/**
 * The overlay the planet lays over every gem it draws from the library. `lookGroup`: the places of
 * the planet's system whose looks are walked with its own, in place order, its own among them
 * (`solar-systems`' `lookGroupAt`); read from ore rules 15 only.
 */
export function planetGemOverlayOf(
  address: PlanetAddress,
  lookGroup: readonly bigint[],
  oreRulesVersion: number | undefined,
  catalogue: GemOverlayCatalogue = GEM_OVERLAYS,
): GemOverlay {
  if ((oreRulesVersion ?? 0) < GEM_OVERLAY_WALK_ORE_RULES) return drawnOverlayOf(address, catalogue)
  const overlays = walkedGroupOverlaysOf(address, lookGroup, catalogue)
  return overlays[placeInGroupOf(address.place, lookGroup)]
}

/**
 * Why a look group could not walk the overlays apart; empty when it can. The CI holds every group
 * the roster draws to it (ticket 890, HS 2 and the VS): room is proven, never fallen back from.
 */
export function overlayRoomProblems(
  groupSize: number,
  catalogue: GemOverlayCatalogue = GEM_OVERLAYS,
): string[] {
  if (groupSize <= catalogue.overlays.length) return []
  return [
    `a look group of ${groupSize} planets has room in ${catalogue.overlays.length} gem overlays for no walk`,
  ]
}

/** Rules 14's one draw, the walk's start from rules 15. */
function drawnOverlayOf(address: PlanetAddress, catalogue: GemOverlayCatalogue): GemOverlay {
  const draw = hashCell(addressSeedOf(address), GEM_OVERLAY_SALT, 0)
  return catalogue.overlays[draw % catalogue.overlays.length]
}

/** Each place of the group's overlay, in group order, each the first free one from its draw. */
function walkedGroupOverlaysOf(
  address: PlanetAddress,
  lookGroup: readonly bigint[],
  catalogue: GemOverlayCatalogue,
): GemOverlay[] {
  assertOverlayRoom(lookGroup.length, catalogue)
  const taken = new Set<string>()
  return lookGroup.map((place) => {
    const draw = hashCell(addressSeedOf({ ...address, place }), GEM_OVERLAY_SALT, 0)
    const overlay = firstFreeFrom(catalogue.overlays, draw, taken) as GemOverlay
    taken.add(overlay.id)
    return overlay
  })
}

function assertOverlayRoom(groupSize: number, catalogue: GemOverlayCatalogue): void {
  const problems = overlayRoomProblems(groupSize, catalogue)
  if (problems.length > 0) throw new RangeError(problems.join('\n'))
}

function placeInGroupOf(place: bigint, lookGroup: readonly bigint[]): number {
  const at = lookGroup.indexOf(place)
  if (at < 0)
    throw new RangeError(`place ${place} is not in its look group ${lookGroup.join(', ')}`)
  return at
}

function slotDrawOf(address: PlanetAddress, slotIndex: number): number {
  return hashCell(addressSeedOf(address), GEM_CUT_SALT, slotIndex)
}

function addressSeedOf({ worldSeed, system, place }: PlanetAddress): number {
  return planetSeedAt(worldSeed, system, place)
}

/** The first cut from the draw's start, wrapping, that no earlier gem of the planet took. */
function freeCutFrom(cuts: readonly GemCut[], draw: number, taken: ReadonlySet<string>): GemCut {
  return firstFreeFrom(cuts, draw, taken) ?? cuts[draw % cuts.length]
}

/** The first row from the draw's start, wrapping, whose id is not taken; one lap at most. */
function firstFreeFrom<Row extends { id: string }>(
  rows: readonly Row[],
  draw: number,
  taken: ReadonlySet<string>,
): Row | undefined {
  for (let step = 0; step < rows.length; step += 1) {
    const row = rows[(draw + step) % rows.length]
    if (!taken.has(row.id)) return row
  }
  return undefined
}
