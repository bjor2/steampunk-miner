/**
 * The star map's spec hooks: the panel and its chart (ticket 769), the chart's tank and planet
 * rows (ticket 757), and the system view's sun and each row's planet glyph (ticket 758).
 */
export const STAR_MAP_UI_IDS = {
  starMapPanel: 'star-map-panel',
  starMapChart: 'star-map-chart',
  starMapTank: 'star-map-tank',
  starMapTankBar: 'star-map-tank-bar',
  starMapSun: 'star-map-sun',
} as const

/** A planet's row on the chart, by its place in the system. */
export function starMapPlanetIdOf(place: number): string {
  return `star-map-planet-${place}`
}

/** The planet glyph on a row, tinted the planet's ground colour. */
export function starMapGlyphIdOf(place: number): string {
  return `star-map-glyph-${place}`
}
