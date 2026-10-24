/**
 * The star map's spec hooks: the panel and its chart (ticket 769), the chart's tank (ticket 757),
 * the drive's offer and the way to the next system (ticket 793), and the carousel (ticket 796):
 * the hero with its Previous and Next, the shown planet's card (the row id of ticket 757, now on
 * the one planet shown) with its glyph (ticket 758, now the hero's picture), and the system strip
 * with each planet's dot, the here ring and the selected marker. The buttons carry the model's
 * ids (`starMapControls.ts`).
 */
export const STAR_MAP_UI_IDS = {
  starMapPanel: 'star-map-panel',
  starMapChart: 'star-map-chart',
  starMapTank: 'star-map-tank',
  starMapTankBar: 'star-map-tank-bar',
  /** The jump drive's offer at the Sell bay and the jump to the next system (ticket 793). */
  starMapDrive: 'star-map-drive',
  starMapJumpOut: 'star-map-jump-out-offer',
  /** The carousel's hero, its steps and the system strip (ticket 796). */
  starMapHero: 'star-map-hero',
  starMapPrevious: 'star-map-previous',
  starMapNext: 'star-map-next',
  starMapSystem: 'star-map-system',
  /** The panned backdrop inside the strip's window: its offset is the pan. */
  starMapSystemTrack: 'star-map-system-track',
  starMapHereRing: 'star-map-here-ring',
  starMapSelectedMarker: 'star-map-selected-marker',
} as const

/** The shown planet's card on the chart, by its place in the system. */
export function starMapPlanetIdOf(place: number): string {
  return `star-map-planet-${place}`
}

/** The shown planet's picture in the hero: its preview, or its glyph tinted the ground colour. */
export function starMapGlyphIdOf(place: number): string {
  return `star-map-glyph-${place}`
}

/** A planet's dot on the system strip, which a tap or click shows. */
export function starMapDotIdOf(place: number): string {
  return `star-map-dot-${place}`
}
