/**
 * Where a dock add-on stands and where its unlock pan looks (#197, #170 amendment): the add-on's
 * origin is its host building's origin plus its `atM`, in world metres, so the add-on art is
 * authored in its own frame and bolts onto the host wherever the pad is.
 */
import type { DockSite } from '../../../../systems/world/dockSite'
import type { DockAddOn } from '../dockAddOns'
import { shopBuildingOriginOf, type WorldPoint } from './buildingOrigin'

export function dockAddOnOriginOf(site: DockSite, addOn: DockAddOn): WorldPoint {
  const host = shopBuildingOriginOf(site, addOn.host)
  return { x: host.x + addOn.atM[0], y: host.y + addOn.atM[1] }
}

/** The point the unlock pan centres on: the add-on's look point in world metres. */
export function dockAddOnLookPointOf(site: DockSite, addOn: DockAddOn): WorldPoint {
  const origin = dockAddOnOriginOf(site, addOn)
  return { x: origin.x + addOn.lookAtM[0], y: origin.y + addOn.lookAtM[1] }
}
