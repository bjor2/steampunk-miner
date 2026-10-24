/**
 * Each planet's new-content slot (ticket 775, palette section E; HS input on #775: "no repeats has
 * to hold for the whole campaign, not just within a system"): one new enemy, hazard or ore family
 * per planet, drawn from Progression's set in campaign order. System `s` owns the families at the
 * set's ordinals `(s - 2) * N .. (s - 2) * N + N - 1`, and a seeded shuffle decides which of its
 * planets gets which, so no family is ever drawn twice anywhere, in any system. Past the set's end a
 * planet's slot is null: a later system stays without a new slot until Progression's set grows
 * (ticket 780 writes the behaviours of the SS2-B rows), and nothing is ever recoloured to fill it.
 */
import { ECONOMY } from '../../../systems/economy/economy'
import { FIRST_SYSTEM } from '../../../systems/starMap/planetAddress'
import type { NewContentFamily } from './paletteRows'
import { ROSTER_STREAM, rosterDrawOf, shuffledOrdinalsOf } from './rosterDraws'

/** The first system the palette draws: system 1 keeps its authored rows. */
export const FIRST_DRAWN_SYSTEM = FIRST_SYSTEM + 1n

/** The planets each system holds. */
export function planetsPerSystem(): number {
  return ECONOMY.starMap.planetsPerSystem
}

/** The system's slot families in planet order: the set's next run of families, shuffled by seed. */
export function slotFamiliesOfSystem(
  worldSeed: number,
  system: bigint,
  families: readonly NewContentFamily[],
): (NewContentFamily | null)[] {
  const count = planetsPerSystem()
  const first = (system - FIRST_DRAWN_SYSTEM) * BigInt(count)
  const shuffled = shuffledOrdinalsOf(count, (index) =>
    rosterDrawOf(worldSeed, system, 1, ROSTER_STREAM.slotShuffle, index),
  )
  return shuffled.map((ordinal) => familyAt(families, first + BigInt(ordinal)))
}

/** The family at a campaign ordinal; null past the set's end. */
function familyAt(families: readonly NewContentFamily[], ordinal: bigint): NewContentFamily | null {
  return families.find((_, at) => BigInt(at) === ordinal) ?? null
}
