/**
 * Where a shop building's art stands (#174): its origin is its zone's centre column on the pad
 * top, where `bayRestPointOf` puts the vehicle, so the build places the asset there and nothing
 * else. The add-ons of #197 are placed from the same point.
 */
import type { ShopBuildingBayId } from '../../../../systems/art/shopBuildingArt'
import { bayCentreColumnOf } from '../../../../systems/world/dockBays'
import type { DockSite } from '../../../../systems/world/dockSite'

export interface WorldPoint {
  x: number
  y: number
}

export function shopBuildingOriginOf(site: DockSite, bay: ShopBuildingBayId): WorldPoint {
  return { x: bayCentreColumnOf(site, bay), y: site.padRow + 1 }
}
