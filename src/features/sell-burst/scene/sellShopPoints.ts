/**
 * The Assay & Exchange's three points the burst uses (#170 attach points, the kernel
 * `building-attach` ids): chunks leave `sell.chute` and drop into the hopper crown behind the
 * `sell.ticker` sign, and coins burst out of `sell.stack`. World metres, from the building's origin
 * (its zone's centre column on the pad top, #174) plus each point's offset in the shipped art.
 */
import type { BuildingAttachUse } from '../../../systems/registries/buildingAttach'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { shopBuildingAttachPointOf } from '../../../systems/art/shopBuildingArt'
import type { BuildingAttachId } from '../../../systems/registries/buildingAttach'
import { bayCentreColumnOf } from '../../../systems/world/dockBays'
import type { DockSite } from '../../../systems/world/dockSite'
import type { FlightPoint } from '../systems/render/burstFlight'

export interface SellShopPoints {
  chute: FlightPoint
  crown: FlightPoint
  stack: FlightPoint
}

/** The uses this slice makes of the Exchange's points, registered so their readers are listed. */
export const SELL_BURST_ATTACH_USES: readonly BuildingAttachUse[] = [
  { id: 'sell-burst.chunks-launch', attach: 'sell.chute' },
  { id: 'sell-burst.chunks-land', attach: 'sell.ticker' },
  { id: 'sell-burst.coins', attach: 'sell.stack' },
]

export function sellShopPointsOf(site: DockSite): SellShopPoints {
  const origin = { x: bayCentreColumnOf(site, 'sell'), y: site.padRow + 1 }
  return {
    chute: pointOnExchange(origin, 'sell.chute'),
    crown: pointOnExchange(origin, 'sell.ticker'),
    stack: pointOnExchange(origin, 'sell.stack'),
  }
}

/** All three are on the shipped Exchange; the art spec pins them (`shopBuildingArt.test.ts`). */
function pointOnExchange(origin: FlightPoint, attach: BuildingAttachId): FlightPoint {
  const point = shopBuildingAttachPointOf(SHIPPED_ART, 'sell', attach)
  if (point === null) throw new Error(`the Exchange has no ${attach} attach point`)
  return { x: origin.x + point.atM[0], y: origin.y + point.atM[1] }
}
