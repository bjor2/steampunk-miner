/**
 * Stabiliser foam's restock (ticket 394, X2; the GD ruling on #381, option c, with the HS and VS
 * conditions): the first consumable the power-up core's restock takes, foam first. One charge
 * costs the lane's per-unit row, 2 units of band-5 ore (#162 4.1), the band foam's price sits in,
 * valued on the planet it is restocked on and never capped by it. The core opens it only to a
 * player who owns foam, which only research of its terrain tier-3 node does (`foamResearch.ts`).
 */
import type { Money } from '../../../systems/money'
import { restockUnitPriceAt, type ConsumableRestock } from '../../power-up-core'
import { terrainItemNamed } from './itemMagnitude'
import { STABILISER_FOAM_ID } from './stabiliserFoam'
import { TERRAIN_ECONOMY } from './terrainEconomy'

const FOAM = terrainItemNamed(STABILISER_FOAM_ID)

export const FOAM_RESTOCK: ConsumableRestock = {
  id: 'terrain-tools.stabiliser-foam-restock',
  itemId: STABILISER_FOAM_ID,
  iconId: FOAM.node.iconId,
  name: FOAM.name,
  unitPrice: TERRAIN_ECONOMY.perUnitPrice,
}

/** The lane's restocked consumables: foam only, until a later ticket opts another in. */
export const TERRAIN_RESTOCKS: readonly ConsumableRestock[] = [FOAM_RESTOCK]

/** One charge of foam restocked on `planetIndex`. */
export function foamRestockPriceAt(planetIndex: number): Money {
  return restockUnitPriceAt(FOAM_RESTOCK, planetIndex)
}
