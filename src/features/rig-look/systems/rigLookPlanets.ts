/**
 * Where a track's look bands land in play (ticket 809, replacing ticket 590's per-step planets;
 * Systems on #647: the per-planet arrival levels are the cadence check). From a bot run's
 * purchases this finds the planet each band edge was first reached on, the purchases each planet
 * made (the fuel tank's too, which the VS asked logged), and the line's cadence: the planets the
 * run finished per band it reached. The VS aims at one new look every 1 to 3 planets on the median
 * path; outside that the check warns and never fails (VS via Systems, 24 Oct 14:58), since a miss
 * goes back to the VS, never to the bot, the economy or the edges.
 */
import type { TrackLookRows } from './render/rigLookIndex'

/** The VS cadence band: one new look every 1 to 3 planets. */
export const PLANETS_PER_BAND_MIN = 1
export const PLANETS_PER_BAND_MAX = 3

/** One upgrade purchase of a run, in run order: the planet it was made on, the count after it. */
export interface TrackPurchase {
  track: string
  planet: number
  toLevel: number
}

/** A band edge and the planet the run first reached it on (null: never). */
export interface EdgeFirstReached {
  edge: number
  planet: number | null
}

/** Each edge of `rows` and where `purchases` first reached it. */
export function edgesFirstReachedOf(
  rows: TrackLookRows,
  purchases: readonly TrackPurchase[],
): EdgeFirstReached[] {
  const own = purchases.filter((purchase) => purchase.track === rows.track)
  return rows.band.edges.map((edge) => ({
    edge,
    planet: own.find((purchase) => purchase.toLevel >= edge)?.planet ?? null,
  }))
}

/** The purchases of `track` on each planet 1 to `lastPlanet`, 0 where it bought none. */
export function purchasesPerPlanetOf(
  track: string,
  purchases: readonly TrackPurchase[],
  lastPlanet: number,
): number[] {
  const own = purchases.filter((purchase) => purchase.track === track)
  return Array.from(
    { length: lastPlanet },
    (_, at) => own.filter((purchase) => purchase.planet === at + 1).length,
  )
}

/**
 * Planets finished per band reached by the end of `lastFinishedPlanet`: Infinity when the run
 * reached no band.
 */
export function planetsPerBandOf(
  rows: TrackLookRows,
  purchases: readonly TrackPurchase[],
  lastFinishedPlanet: number,
): number {
  const reached = edgesFirstReachedOf(rows, purchases).filter(
    (edge) => edge.planet !== null && edge.planet <= lastFinishedPlanet,
  ).length
  return reached === 0 ? Infinity : lastFinishedPlanet / reached
}

/** The warning a run's cadence on `rows` earns, null inside 1 to 3 planets a band. */
export function cadenceWarningOf(
  rows: TrackLookRows,
  purchases: readonly TrackPurchase[],
  lastFinishedPlanet: number,
): string | null {
  const cadence = planetsPerBandOf(rows, purchases, lastFinishedPlanet)
  if (cadence >= PLANETS_PER_BAND_MIN && cadence <= PLANETS_PER_BAND_MAX) return null
  return `${rows.track}: ${cadenceTextOf(cadence)} by P${lastFinishedPlanet}`
}

function cadenceTextOf(cadence: number): string {
  return Number.isFinite(cadence) ? `${cadence.toFixed(2)} planets a band` : 'no band reached'
}
