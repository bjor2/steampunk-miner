/**
 * The platform's two bays on the dock pad (decision #37): the Sell bay on the spawn side (left of
 * the pad's middle) and the Upgrade bay 8 m to its right, each with its own pad zone. Runs start
 * and the tow lands on the Sell bay, so the first dock is always there. The hub between the bays
 * is part of the pad (energy 0 never strands there) but docks at neither bay.
 *
 * Integer tiles and millimetres only, like every zone test the authority replays.
 */
import { MM_PER_METRE } from '../../constants/physics'
import type { DockSite } from './dockSite'
import { BAY_CENTRE_OFFSET_TILES, BAY_HALF_WIDTH_TILES } from './planetTable'
import type { TilePoint } from './tileGrid'

export const BAY_IDS = ['sell', 'upgrade'] as const

export type BayId = (typeof BAY_IDS)[number]

/** The tile columns of one bay's pad zone; rows are the pad's cleared air, as for the whole pad. */
export interface BayColumns {
  firstColumn: number
  lastColumn: number
}

const BAY_SIDE: Readonly<Record<BayId, -1 | 1>> = { sell: -1, upgrade: 1 }

export function isBayId(value: unknown): value is BayId {
  return (BAY_IDS as readonly unknown[]).includes(value)
}

/** The pad's middle is the boundary between its two halves (columns -half .. half-1). */
export function bayCentreColumnOf(site: DockSite, bay: BayId): number {
  const middle = (site.firstColumn + site.lastColumn + 1) / 2
  return middle + BAY_SIDE[bay] * BAY_CENTRE_OFFSET_TILES
}

export function bayColumnsOf(site: DockSite, bay: BayId): BayColumns {
  const centre = bayCentreColumnOf(site, bay)
  return {
    firstColumn: centre - BAY_HALF_WIDTH_TILES,
    lastColumn: centre + BAY_HALF_WIDTH_TILES - 1,
  }
}

/** Whether a tile lies in a bay's pad zone: its columns, above the pad, under the clearance. */
export function isTileInBay(site: DockSite, bay: BayId, tile: TilePoint): boolean {
  const columns = bayColumnsOf(site, bay)
  const isInColumns = tile.tx >= columns.firstColumn && tile.tx <= columns.lastColumn
  return isInColumns && tile.ty > site.padRow && tile.ty <= site.clearanceTopRow
}

/** The bay whose pad zone holds a tile, or null on the hub and away from the pad. */
export function bayOfTile(site: DockSite, tile: TilePoint): BayId | null {
  return BAY_IDS.find((bay) => isTileInBay(site, bay, tile)) ?? null
}

/** The tile a vehicle rests in at a bay: the bay's centre column, just above the pad. */
export function bayRestTileOf(site: DockSite, bay: BayId): TilePoint {
  return { tx: bayCentreColumnOf(site, bay), ty: site.dockPoint.ty }
}

/** Where a vehicle rests in a bay: the bay's centre line, on the pad, in millimetres. */
export function bayRestPointOf(site: DockSite, bay: BayId): { x: number; y: number } {
  return {
    x: bayCentreColumnOf(site, bay) * MM_PER_METRE,
    y: site.dockPoint.ty * MM_PER_METRE + MM_PER_METRE / 2,
  }
}
