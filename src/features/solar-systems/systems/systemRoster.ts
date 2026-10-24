/**
 * A solar system's roster (ticket 775, spec #774): the planets of any system past the first, each
 * drawn from the archetype palette by its address seed, never written per planet. Everything keys
 * on the contiguous campaign index `g = campaignIndex(s, p)` (the TD ruling on ticket 781): the
 * act (#141's at `g`, through the planet-mix slice), the name's number and the look's act.
 *
 * - **Id.** The planet is its address `(s, p)` as canonical index text (HS input: ids are stable,
 *   display names never are). The roster never reads a name back.
 * - **Look and name.** The act's looks walked from a seeded start: the first planet of an act in a
 *   system draws where the walk starts, the next planet of the same act takes the next look, so a
 *   system repeats a look only once the act's looks run out. The look's act is the planet's own
 *   (HS-2). The name's prefix walks the act's prefixes the same way and its noun walks the shared
 *   nouns over the whole system, so no two planets of a system read alike before the number.
 * - **Surface.** The system's last planet starts `hard` (P&N: at most one valuable planet per
 *   system, the highest `g`, never P1); every other planet starts `std`. The hard planet never
 *   stacks with the jump step at arrival, since P1 is always `std`. Its step k_s is ticket 776's row.
 * - **Size.** A class drawn by seed; XL only on a standard start (`standardOnly`).
 * - **Slot.** The system's run of Progression's new families, shuffled (`newContentSlots.ts`).
 *
 * Pure, bounded and finite at any `s` the campaign index keeps a safe planet index for; a system of
 * the first (system 1) or a place outside the system is refused, never guessed.
 */
import { campaignIndex, planetIndexOfCampaign } from '../../../systems/starMap/campaignIndex'
import { toIndexText } from '../../../systems/starMap/planetAddress'
import { actOf, type OreAct } from '../../planet-mix'
import { FIRST_DRAWN_SYSTEM, planetsPerSystem, slotFamiliesOfSystem } from './newContentSlots'
import {
  ARCHETYPE_PALETTE,
  type ArchetypePalette,
  type BiomeLook,
  type NewContentFamily,
  type SizeClass,
} from './paletteRows'
import { ledgerHookOf, planetNameOf } from './rosterNames'
import { pickedBy, ROSTER_STREAM, rosterDrawOf, type RosterStream } from './rosterDraws'

export type SurfaceStart = 'std' | 'hard'

export interface PlanetId {
  /** The system index as canonical text. */
  system: string
  /** The place in the system as canonical text. */
  planet: string
}

export interface RosterPlanet {
  id: PlanetId
  /** `g`, as canonical text. */
  campaignIndex: string
  /** `<Prefix> <Noun> <g>`; display only. */
  name: string
  /** The #141 act at `g`. */
  act: string
  /** A palette look id. */
  look: string
  /** A palette size class id. */
  sizeClass: string
  surface: SurfaceStart
  /** The planet's new enemy, hazard or ore family; null once the set is spent. */
  slot: NewContentFamily | null
  /** The ledger hook, filled from the palette's template. */
  hook: string
}

interface PlanetDraw {
  system: bigint
  planet: number
  campaignIndex: bigint
  act: OreAct
}

/** The planets of system `system` (from 2) in place order. */
export function systemRosterOf(
  worldSeed: number,
  system: bigint,
  palette: ArchetypePalette = ARCHETYPE_PALETTE,
): RosterPlanet[] {
  assertDrawnSystem(system)
  const draws = placesOf(system).map((planet) => planetDrawOf(system, planet))
  const slots = slotFamiliesOfSystem(worldSeed, system, palette.newContent.families)
  return draws.map((draw, at) => rosterPlanetFrom(worldSeed, palette, draws, draw, slots[at]))
}

/** One planet of a system past the first; throws for system 1 or a place the system lacks. */
export function rosterPlanetOf(
  worldSeed: number,
  system: bigint,
  planet: bigint,
  palette: ArchetypePalette = ARCHETYPE_PALETTE,
): RosterPlanet {
  const roster = systemRosterOf(worldSeed, system, palette)
  const found = roster.find((candidate) => candidate.id.planet === toIndexText(planet))
  if (found === undefined) throw new RangeError(`system ${system} holds no planet ${planet}`)
  return found
}

function rosterPlanetFrom(
  worldSeed: number,
  palette: ArchetypePalette,
  draws: readonly PlanetDraw[],
  draw: PlanetDraw,
  slot: NewContentFamily | null,
): RosterPlanet {
  const look = lookOf(worldSeed, palette, draws, draw)
  const surface = surfaceOf(draw.planet)
  return {
    id: { system: toIndexText(draw.system), planet: toIndexText(BigInt(draw.planet)) },
    campaignIndex: toIndexText(draw.campaignIndex),
    name: planetNameOf(
      palette.names,
      draw.act,
      draw.campaignIndex,
      nameDrawsOf(worldSeed, draws, draw),
    ),
    act: draw.act.id,
    look: look.id,
    sizeClass: sizeClassOf(worldSeed, palette, draw, surface).id,
    surface,
    slot,
    hook: ledgerHookOf(palette.names, draw.campaignIndex, look, draw.act, slot),
  }
}

function planetDrawOf(system: bigint, planet: number): PlanetDraw {
  const index = campaignIndex(system, BigInt(planet))
  return { system, planet, campaignIndex: index, act: actOf(planetIndexOfCampaign(index)) }
}

/** The prefix walks the act's planets in the system, the noun the whole system's. */
function nameDrawsOf(worldSeed: number, draws: readonly PlanetDraw[], draw: PlanetDraw) {
  return {
    prefix: walkPickOf(worldSeed, planetsOfAct(draws, draw), draw, ROSTER_STREAM.prefix),
    noun: walkPickOf(worldSeed, draws, draw, ROSTER_STREAM.noun),
  }
}

/**
 * A walk's pick for one of its planets: the start its first planet drew under the stream, then one
 * step per planet of the walk before this one, so a list longer than the walk never repeats an entry.
 */
function walkPickOf(
  worldSeed: number,
  walk: readonly PlanetDraw[],
  draw: PlanetDraw,
  stream: RosterStream,
): number {
  const start = rosterDrawOf(worldSeed, draw.system, walk[0].planet, stream)
  return start + walk.indexOf(draw)
}

function planetsOfAct(draws: readonly PlanetDraw[], draw: PlanetDraw): PlanetDraw[] {
  return draws.filter((candidate) => candidate.act.id === draw.act.id)
}

/** The act's looks, walked from the start the act's first planet in the system drew. */
function lookOf(
  worldSeed: number,
  palette: ArchetypePalette,
  draws: readonly PlanetDraw[],
  draw: PlanetDraw,
): BiomeLook {
  const looks = looksOfAct(palette, draw.act)
  return pickedBy(
    looks,
    walkPickOf(worldSeed, planetsOfAct(draws, draw), draw, ROSTER_STREAM.lookWalk),
  )
}

function looksOfAct(palette: ArchetypePalette, act: OreAct): BiomeLook[] {
  const looks = palette.looks.filter((look) => look.act === act.id)
  if (looks.length === 0) throw new RangeError(`the palette has no look for act "${act.id}"`)
  return looks
}

function sizeClassOf(
  worldSeed: number,
  palette: ArchetypePalette,
  draw: PlanetDraw,
  surface: SurfaceStart,
): SizeClass {
  const allowed = palette.sizeClasses.classes.filter(
    (sizeClass) => surface === 'std' || !sizeClass.standardOnly,
  )
  return pickedBy(
    allowed,
    rosterDrawOf(worldSeed, draw.system, draw.planet, ROSTER_STREAM.sizeClass),
  )
}

/** The last planet of a system of two or more starts hard; P1 and every other planet standard. */
function surfaceOf(planet: number): SurfaceStart {
  const count = planetsPerSystem()
  return count > 1 && planet === count ? 'hard' : 'std'
}

function placesOf(system: bigint): number[] {
  assertDrawnSystem(system)
  return Array.from({ length: planetsPerSystem() }, (_, at) => at + 1)
}

function assertDrawnSystem(system: bigint): void {
  if (system < FIRST_DRAWN_SYSTEM) {
    throw new RangeError(`system ${system} keeps its own rows: the palette draws from system 2`)
  }
}
