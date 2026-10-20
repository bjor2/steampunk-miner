/**
 * The pinned surface layer (ticket 625), the `planets.surfaceLayer` block of economy.json: Systems'
 * spec on #306 (comment 6301879176), its ramp amendment on #625 (6301918833) and the Vertical
 * Scaler's confirmation (6301930425). With `d` the depth in cells below the surface, rock is
 *
 *   H(d) = H_s                                    d < S
 *   H_s * (H_b1 / H_s)^((d - S + 1) / K)          S <= d < S + K
 *   the shipped band value                        deeper, every band absolute (no rebase)
 *
 *   K(p) = max(rampMinCells, ceil(ln(H_b1 / H_s) / ln rampStepRatio))
 *
 * with S = `pinnedCells` (3), `H_b1` the planet's band-1 rock and `H_s` its surface, `eta^tiers`
 * (`eta` = `ore.hardnessRatio`): K is 4 or more and about 16 on planet 10, so felt cut speed changes
 * by at most 1.5x a cell. S + K must fit inside band 1; where it does not, K is the band-1
 * thickness minus S and the step is larger (the surface report lists those planets amber).
 *
 * The surface is keyed on the solar system (HS condition 2): `systems` rows by first planet, the
 * last one running on, so a new system that starts harder is a row of its own. A planet with a
 * harder surface (a biome or a valuable planet, HS condition 1) is a `planetSurfaces` row on top
 * of its system's, never a residue of the old curve; none are listed yet (the GD confirms any).
 */
import { cmp, fromSafeInteger, type BigStat } from '../money'
import type { FieldReader } from './economyFieldReader'

export interface SurfaceLayerRules {
  /** Cells below the surface held at the surface hardness (S). */
  pinnedCells: number
  /** The fewest cells the ramp from the surface to band 1 takes (the 4 of K(p)). */
  rampMinCells: number
  /** The largest hardness step between neighbouring ramp cells K(p) is sized for (1.5). */
  rampStepRatio: BigStat
  /** Each solar system's surface, by its first planet, in hardness tiers above 1. */
  systems: readonly SystemSurface[]
  /** A planet whose surface differs from its system's, with why. */
  planetSurfaces: readonly PlanetSurface[]
}

export interface SystemSurface {
  system: number
  firstPlanet: number
  /** The surface hardness as tiers of `ore.hardnessRatio` above 1: 0 is H = 1. */
  surfaceTiers: number
}

export interface PlanetSurface {
  planet: number
  surfaceTiers: number
  /** The biome or valuable-planet ruling the row stands for. */
  why: string
}

const PATH = 'planets.surfaceLayer'
const ONE = fromSafeInteger(1)

export function readSurfaceLayer(reader: FieldReader, value: unknown): SurfaceLayerRules {
  const layer = reader.object(PATH, value)
  const read = {
    pinnedCells: reader.safeInteger(`${PATH}.pinnedCells`, layer.pinnedCells),
    rampMinCells: reader.safeInteger(`${PATH}.rampMinCells`, layer.rampMinCells),
    rampStepRatio: reader.money(`${PATH}.rampStepRatio`, layer.rampStepRatio),
    systems: reader
      .list(`${PATH}.systems`, layer.systems)
      .map((row, at) => readSystemSurface(reader, `${PATH}.systems[${at}]`, row)),
    planetSurfaces: reader
      .list(`${PATH}.planetSurfaces`, layer.planetSurfaces)
      .map((row, at) => readPlanetSurface(reader, `${PATH}.planetSurfaces[${at}]`, row)),
  }
  recordShapeProblems(reader, read)
  return read
}

/** The surface tiers of a planet: its own row, else the last system row it has reached. */
export function surfaceTiersOf(rules: SurfaceLayerRules, planetIndex: number): number {
  const own = rules.planetSurfaces.find((row) => row.planet === planetIndex)
  return own?.surfaceTiers ?? systemSurfaceOf(rules, planetIndex).surfaceTiers
}

function systemSurfaceOf(rules: SurfaceLayerRules, planetIndex: number): SystemSurface {
  const reached = rules.systems.filter((row) => row.firstPlanet <= planetIndex)
  return reached[reached.length - 1]
}

function readSystemSurface(reader: FieldReader, path: string, value: unknown): SystemSurface {
  const row = reader.object(path, value)
  return {
    system: reader.safeInteger(`${path}.system`, row.system),
    firstPlanet: reader.safeInteger(`${path}.firstPlanet`, row.firstPlanet),
    surfaceTiers: reader.safeInteger(`${path}.surfaceTiers`, row.surfaceTiers),
  }
}

function readPlanetSurface(reader: FieldReader, path: string, value: unknown): PlanetSurface {
  const row = reader.object(path, value)
  return {
    planet: reader.safeInteger(`${path}.planet`, row.planet),
    surfaceTiers: reader.safeInteger(`${path}.surfaceTiers`, row.surfaceTiers),
    why: reader.text(`${path}.why`, row.why),
  }
}

function recordShapeProblems(reader: FieldReader, rules: SurfaceLayerRules): void {
  if (rules.pinnedCells < 0) reader.record(`${PATH}.pinnedCells must be 0 or more`)
  if (rules.rampMinCells < 1) reader.record(`${PATH}.rampMinCells must be 1 or more`)
  if (cmp(rules.rampStepRatio, ONE) <= 0) reader.record(`${PATH}.rampStepRatio must be above 1`)
  if (rules.systems[0]?.firstPlanet !== 1) {
    reader.record(`${PATH}.systems must start with the system of planet 1`)
  }
  if (!isRising(rules.systems.map((row) => row.firstPlanet))) {
    reader.record(`${PATH}.systems must list their first planets in rising order`)
  }
  if (![...rules.systems, ...rules.planetSurfaces].every((row) => row.surfaceTiers >= 0)) {
    reader.record(`${PATH} surfaceTiers must be 0 or more`)
  }
}

function isRising(values: readonly number[]): boolean {
  return values.every((value, at) => at === 0 || value > values[at - 1])
}
