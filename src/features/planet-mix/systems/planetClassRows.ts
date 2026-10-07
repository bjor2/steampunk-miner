/**
 * The planet classes' data (GD lock on spec #258, Q1, Q2 and Q8), read once from the slice's two
 * files and refused whole when broken, like the theme rows:
 *
 * - `planetClasses.json` (Planet & Narrative): the act-to-class table the frost, lodestone and
 *   hollow specs share, and the story planets whose own row wins over their act's class (P30, relic).
 * - `planet-mix.economy.json` `magnetic` (Systems): how far a ferrous vein's field reaches past the
 *   vein's own radius, and the share of ferrous cells that are electrified, in basis points. The
 *   share is the balance lever the lock names first, before the shock time.
 */
import economyFile from '../planet-mix.economy.json'
import classesFile from '../planetClasses.json'
import { THEME_ROWS, type ThemeRows } from './themeRows'

export const PLANET_CLASSES = ['frozen', 'magnetic', 'hollow', 'relic'] as const

export type PlanetClass = (typeof PLANET_CLASSES)[number]

export interface MagneticRows {
  /** Tiles a field reaches past its vein's patch radius. */
  fieldMarginTiles: number
  /** Ferrous cells electrified, in basis points of the vein's cells. */
  electrifiedShareBp: number
}

export interface PlanetClassRows {
  /** Act id to class; an act with no entry has no class. */
  classByAct: Readonly<Record<string, PlanetClass>>
  /** Campaign story planets whose own class wins over their act's. */
  classByStoryPlanet: Readonly<Record<string, PlanetClass>>
  magnetic: MagneticRows
}

type Raw = Record<string, unknown>

const BASIS_POINTS = 10000

export const PLANET_CLASS_ROWS: PlanetClassRows = loadPlanetClassRows(classesFile, economyFile)

/** Why the two files are not #258's data; empty when they are. */
export function planetClassRowProblems(
  classes: unknown,
  economy: unknown,
  themes: ThemeRows = THEME_ROWS,
): string[] {
  const raw = classes as Raw
  return [
    ...actClassProblems(raw.classByAct, themes),
    ...storyClassProblems(raw.classByStoryPlanet, themes),
    ...magneticProblems(((economy as Raw).magnetic ?? {}) as Raw),
  ]
}

function loadPlanetClassRows(
  classes: typeof classesFile,
  economy: typeof economyFile,
): PlanetClassRows {
  const problems = planetClassRowProblems(classes, economy)
  if (problems.length > 0)
    throw new Error(`The planet-mix class data is refused:\n${problems.join('\n')}`)
  return {
    classByAct: classes.classByAct as Record<string, PlanetClass>,
    classByStoryPlanet: classes.classByStoryPlanet as Record<string, PlanetClass>,
    magnetic: economy.magnetic,
  }
}

function actClassProblems(table: unknown, themes: ThemeRows): string[] {
  const actIds = themes.acts.map((act) => act.id)
  const entries = Object.entries((table ?? {}) as Raw)
  return [
    ...entries
      .filter(([actId]) => !actIds.includes(actId))
      .map(([actId]) => `classByAct names "${actId}", which no act has`),
    ...entries
      .filter(([, planetClass]) => !isPlanetClass(planetClass))
      .map(([actId]) => `classByAct.${actId} must name a planet class`),
  ]
}

function storyClassProblems(table: unknown, themes: ThemeRows): string[] {
  const entries = Object.entries((table ?? {}) as Raw)
  return [
    ...entries
      .filter(([planet]) => !themes.storyPlanets.includes(Number.parseInt(planet, 10)))
      .map(([planet]) => `classByStoryPlanet names planet ${planet}, which is no story planet`),
    ...entries
      .filter(([, planetClass]) => !isPlanetClass(planetClass))
      .map(([planet]) => `classByStoryPlanet.${planet} must name a planet class`),
  ]
}

function magneticProblems(magnetic: Raw): string[] {
  const share = magnetic.electrifiedShareBp
  return [
    ...(isWhole(magnetic.fieldMarginTiles, 0)
      ? []
      : ['magnetic.fieldMarginTiles must be whole, from 0']),
    ...(isWhole(share, 0) && share <= BASIS_POINTS
      ? []
      : ['magnetic.electrifiedShareBp must be in basis points']),
  ]
}

function isPlanetClass(value: unknown): boolean {
  return (PLANET_CLASSES as readonly unknown[]).includes(value)
}

function isWhole(value: unknown, from: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= from
}
