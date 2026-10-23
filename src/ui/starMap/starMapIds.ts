/**
 * The star map's spec hooks: the panel and its chart (ticket 769), and the chart's tank and planet
 * rows (ticket 757).
 */
export const STAR_MAP_UI_IDS = {
  starMapPanel: 'star-map-panel',
  starMapChart: 'star-map-chart',
  starMapTank: 'star-map-tank',
} as const

/** A planet's row on the chart, by its place in the system. */
export function starMapPlanetIdOf(place: number): string {
  return `star-map-planet-${place}`
}
