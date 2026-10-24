/**
 * The star map controls' ids (ticket 793): each a button's `data-testid` and its menu focus stop.
 * A leaf, so the browser specs name the buttons without loading the rules behind them.
 */

/** The star map's panel among a screen's focus stops. */
export const STAR_MAP_FOCUS_PANEL = 'starMap'
export const STAR_MAP_BUY_TANK_ID = 'star-map-buy-tank'
export const STAR_MAP_BUY_DRIVE_ID = 'star-map-buy-drive'
export const STAR_MAP_JUMP_OUT_ID = 'star-map-jump-out'
export const STAR_MAP_JUMP_OUT_FUEL_ID = 'star-map-jump-out-fuel'

/** A planet's Jump on the map, by its place in the system. */
export function starMapJumpIdOf(place: number): string {
  return `star-map-jump-${place}`
}

/** A planet's Buy fuel on the map, by its place in the system. */
export function starMapBuyFuelIdOf(place: number): string {
  return `star-map-buy-fuel-${place}`
}
