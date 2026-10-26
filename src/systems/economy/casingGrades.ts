/**
 * What a casing grade holds and how hard its lining is: grades by depth on one global ladder
 * (ticket 829, the GD lock re-pinning decision #41's per-planet 1 to 5 rule by name, Systems' law):
 *
 *   requiredCasingGrade(cell) = q_surface(g) + b + biomeDelta
 *
 * - `q_surface(g)` is the planet row's field (`registries/planetRow.ts`), `4(g - 1) + 1` unless the
 *   row lifts it, so a planet's surface needs the planet before's bottom grade and arrival never
 *   bursts; planet 1 asks bands 1 to 5 grades 1 to 5, as #41 did.
 * - `b` is the cell's band from 0 (the surface band) to the last ore band, the core clamped to the
 *   last (`gradesPerPlanet` 4 and the five bands are data, `ore.coreTierBand`).
 * - `biomeDelta` (0 or 1) is the field of the biome whose ground the cell is: the hazard act whose
 *   planets hold it (`archetypes[].casingBiomeDelta`), and none on the other planets. Every cell of
 *   a band reads its host ground, ore and gem cells too, and band 0 never adds it, so arrival never
 *   bursts on any planet.
 *
 *   casingHardness(p, G) = H(t(p, band(G)))    re-drilling lining is the rock of the band G holds
 *
 * Casing drops no ore and is not a vehicle track.
 *
 * A gnawed wall against collapse (Systems ruling (C) on #676, the TD pin):
 *   grade = max(1, native - min(gnaws, gnawMaxDrop))     whole grades; native = the wall's required
 */
import { countAsSafeInteger } from '../wholeCount'
import type { BigStat } from '../money'
import { casingSurfaceGradeOf } from '../registries/planetRow'
import { ECONOMY } from './economy'
import type { HazardArchetype } from './economyDefinition'
import { oreHardness } from './oreEconomy'

const { casing, ore } = ECONOMY
const FIRST_PLANET = 1
const SURFACE_BAND = 1
const NO_GRADES = BigInt(0)

/** A cell as the ladder reads it: its planet and its casing band (1 to 5, the core's band 6). */
export interface CasingCell {
  planetIndex: number
  band: number
}

/** One planet's ladder: its surface grade and what its biome adds below the surface band. */
export interface CasingLadder {
  surfaceGrade: bigint
  biomeDelta: number
}

/** The least grade that holds the cell: its planet's surface grade, its band and its biome. */
export function requiredCasingGrade(cell: CasingCell): bigint {
  return requiredGradeOnLadder(casingLadderOf(cell.planetIndex), cell.band)
}

/** The grade a band needs on a ladder; a fixture ladder takes the same law as a shipped one. */
export function requiredGradeOnLadder(ladder: CasingLadder, band: number): bigint {
  const depth = ladderDepthOf(band)
  const biome = depth === 0 ? 0 : ladder.biomeDelta
  return ladder.surfaceGrade + BigInt(depth + biome)
}

/** The planet's ladder from its row and its biome. */
export function casingLadderOf(planetIndex: number): CasingLadder {
  return {
    surfaceGrade: casingSurfaceGradeOf(planetIndex),
    biomeDelta: casingBiomeDeltaOf(planetIndex),
  }
}

/** The planet's last ore band's grade, the core's too: the grade a rig needs for the whole planet. */
export function bottomCasingGrade(planetIndex: number): bigint {
  return requiredCasingGrade({ planetIndex, band: ore.coreTierBand })
}

/** What the biome of the hazard act holding the planet adds below band 1; 0 off every act. */
export function casingBiomeDeltaOf(planetIndex: number): number {
  return biomeOfPlanet(planetIndex)?.casingBiomeDelta ?? 0
}

/** The hazard act whose planets hold the planet: its biome and its lining (#113). */
export function biomeOfPlanet(planetIndex: number): HazardArchetype | null {
  const { archetypes } = ECONOMY
  return archetypes.find(({ planets }) => isInRange(planets, planetIndex)) ?? null
}

/**
 * The cell's depth on the ladder, 0 for the surface band: bands as fractions of the radius (#4),
 * the core clamped to the last ore band.
 */
export function ladderDepthOf(band: number): number {
  const lastOreBand = ore.coreTierBand - 1
  return Math.min(band, lastOreBand) - SURFACE_BAND
}

/**
 * The band whose rock a lining of `grade` is on planet `planetIndex`: the band that needs it, at
 * least band 1, never clamped at the top (a grade past the planet's needs is harder rock still).
 */
export function bandHeldByGrade(planetIndex: number, grade: bigint): number {
  const above = grade - casingSurfaceGradeOf(planetIndex)
  return countAsSafeInteger(above < NO_GRADES ? NO_GRADES : above) + SURFACE_BAND
}

/** Hardness of a lining sample of `grade` on planet `planetIndex`: the rock of the band it holds. */
export function casingHardness(planetIndex: number, grade: bigint): BigStat {
  assertGrade(grade)
  const band = bandHeldByGrade(planetIndex, grade)
  return oreHardness(ore.tiersPerPlanet * (planetIndex - FIRST_PLANET) + band)
}

/** The least grade a gnawed wall holds: the first grade lining is laid at. */
export const GNAWED_GRADE_FLOOR = BigInt(casing.casingGradeStart)

/**
 * What a wall of native grade `nativeGrade` holds against collapse after `gnaws` wrecker gnaws:
 * at most `maxDrop` grades less, never below `GNAWED_GRADE_FLOOR`. Worked out on read, never saved.
 */
export function gnawedCasingGrade(
  nativeGrade: bigint,
  gnaws: number,
  maxDrop: number = casing.gnawMaxDrop,
): bigint {
  const dropped = nativeGrade - BigInt(Math.min(gnaws, maxDrop))
  return dropped > GNAWED_GRADE_FLOOR ? dropped : GNAWED_GRADE_FLOOR
}

export function isCasingGradeEnough(grade: bigint, cell: CasingCell): boolean {
  return grade >= requiredCasingGrade(cell)
}

function isInRange(planets: { first: number; last: number }, planetIndex: number): boolean {
  return planetIndex >= planets.first && planetIndex <= planets.last
}

function assertGrade(grade: bigint): void {
  if (grade < GNAWED_GRADE_FLOOR) {
    throw new RangeError(`a casing grade must be a whole number >= 1, got ${grade}`)
  }
}
