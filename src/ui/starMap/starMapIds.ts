/**
 * The star map's spec hooks: the panel and its chart (ticket 769), the chart's tank and planet
 * rows (ticket 757), the system view's sun and each row's planet glyph (ticket 758), and the
 * drive's offer and the way to the next system (ticket 793). The buttons carry the model's ids
 * (`starMapControls.ts`).
 */
export const STAR_MAP_UI_IDS = {
  starMapPanel: 'star-map-panel',
  starMapChart: 'star-map-chart',
  starMapTank: 'star-map-tank',
  starMapTankBar: 'star-map-tank-bar',
  starMapSun: 'star-map-sun',
  /** The jump drive's offer at the Sell bay and the jump to the next system (ticket 793). */
  starMapDrive: 'star-map-drive',
  starMapJumpOut: 'star-map-jump-out-offer',
} as const

/** A planet's row on the chart, by its place in the system. */
export function starMapPlanetIdOf(place: number): string {
  return `star-map-planet-${place}`
}

/** The planet glyph on a row, tinted the planet's ground colour. */
export function starMapGlyphIdOf(place: number): string {
  return `star-map-glyph-${place}`
}
