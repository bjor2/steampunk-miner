/**
 * The platform's bays on the dock pad (decision #37, laid out under two buildings by #170): the
 * Sell bay under the Assay & Exchange on the spawn side (left of the dock point) and the Upgrade
 * bay on the Engineering Works' turntable 12 m to its right, each with its own pad zone; from its
 * unlock planet the Refinery bay in the yard between them (#105, #170). Runs start and the tow
 * lands on the Sell bay, so the first dock is always there. The yard is part of the pad (energy 0
 * never strands there) but docks at no bay until the Refinery's. A planet's site lists the bays
 * its pad holds.
 *
 * Integer tiles and millimetres only, like every zone test the authority replays.
 */
import { MM_PER_METRE } from '../../constants/physics'
import type { DockSite } from './dockSite'
import {
  BAY_HALF_WIDTH_TILES,
  REFINERY_BAY_CENTRE_OFFSET_TILES,
  SELL_BAY_CENTRE_OFFSET_TILES,
  UPGRADE_BAY_CENTRE_OFFSET_TILES,
} from './planetTable'
import type { TilePoint } from './tileGrid'

export const BAY_IDS = ['sell', 'upgrade', 'refinery'] as const

export type BayId = (typeof BAY_IDS)[number]

/** The tile columns of one bay's pad zone; rows are the pad's cleared air, as for the whole pad. */
export interface BayColumns {
  firstColumn: number
  lastColumn: number
}

/** The two bays every platform has (#37); the refinery joins them from its unlock planet. */
export const SLICE_BAY_IDS: readonly BayId[] = ['sell', 'upgrade']

/** Each bay's centre column, in tiles from the dock point. */
const BAY_CENTRE_OFFSETS: Readonly<Record<BayId, number>> = {
  sell: -SELL_BAY_CENTRE_OFFSET_TILES,
  upgrade: UPGRADE_BAY_CENTRE_OFFSET_TILES,
  refinery: REFINERY_BAY_CENTRE_OFFSET_TILES,
}

export function isBayId(value: unknown): value is BayId {
  return (BAY_IDS as readonly unknown[]).includes(value)
}

/** A bay's centre column; the dock point is the middle of the yard. */
export function bayCentreColumnOf(site: DockSite, bay: BayId): number {
  return site.dockPoint.tx + BAY_CENTRE_OFFSETS[bay]
}

export function bayColumnsOf(site: DockSite, bay: BayId): BayColumns {
  const centre = bayCentreColumnOf(site, bay)
  return {
    firstColumn: centre - BAY_HALF_WIDTH_TILES,
    lastColumn: centre + BAY_HALF_WIDTH_TILES - 1,
  }
}

/** Whether this planet's pad holds the bay (the refinery's only from its unlock planet). */
export function hasBay(site: DockSite, bay: BayId): boolean {
  return site.bays.includes(bay)
}

/** Whether a tile lies in a bay's pad zone: its columns, above the pad, under the clearance. */
export function isTileInBay(site: DockSite, bay: BayId, tile: TilePoint): boolean {
  return (
    hasBay(site, bay) && isInBayColumns(bayColumnsOf(site, bay), tile) && isInClearance(site, tile)
  )
}

/** The bay whose pad zone holds a tile, or null in a yard with no bay and away from the pad. */
export function bayOfTile(site: DockSite, tile: TilePoint): BayId | null {
  return site.bays.find((bay) => isTileInBay(site, bay, tile)) ?? null
}

function isInBayColumns(columns: BayColumns, tile: TilePoint): boolean {
  return tile.tx >= columns.firstColumn && tile.tx <= columns.lastColumn
}

function isInClearance(site: DockSite, tile: TilePoint): boolean {
  return tile.ty > site.padRow && tile.ty <= site.clearanceTopRow
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
