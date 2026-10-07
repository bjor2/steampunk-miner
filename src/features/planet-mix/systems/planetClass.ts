/**
 * A planet's class (GD lock on spec #258, Q1): magnetic for the Lodestone act, and the frozen and
 * hollow classes of the Frost and Hollow acts from the same act-to-class table. The class is read
 * from the act id `actOf` answers, never from planet numbers, so endless (P41+) follows its act
 * cycle: on main the Lodestone act falls at P43, P48 and every fifth planet after. A campaign story
 * planet's own class wins over its act's: P30 is relic, not magnetic.
 *
 * Horizontal: a class is a new kind of planet to see and play, never more value (#141's band value
 * holds; the induction-class ore is the act's existing `relic` rare, gated by #142 unchanged).
 */
import { actOf } from './planetActs'
import { PLANET_CLASS_ROWS, type PlanetClass, type PlanetClassRows } from './planetClassRows'
import { THEME_ROWS, type ThemeRows } from './themeRows'

/** The planet's class; null on a planet whose act has none (Foothold, Fire). */
export function planetClassOf(
  planetIndex: number,
  rows: PlanetClassRows = PLANET_CLASS_ROWS,
  themes: ThemeRows = THEME_ROWS,
): PlanetClass | null {
  return storyClassOf(planetIndex, rows, themes) ?? actClassOf(planetIndex, rows, themes)
}

/** Whether the planet is of the Lodestone act's magnetic class. */
export function isMagneticPlanet(planetIndex: number): boolean {
  return planetClassOf(planetIndex) === 'magnetic'
}

/** Story planets are campaign planets: endless repeats acts, never a story beat. */
function storyClassOf(
  planetIndex: number,
  rows: PlanetClassRows,
  themes: ThemeRows,
): PlanetClass | null {
  if (planetIndex >= themes.endlessFromPlanet) return null
  return rows.classByStoryPlanet[String(planetIndex)] ?? null
}

function actClassOf(
  planetIndex: number,
  rows: PlanetClassRows,
  themes: ThemeRows,
): PlanetClass | null {
  return rows.classByAct[actOf(planetIndex, themes).id] ?? null
}
