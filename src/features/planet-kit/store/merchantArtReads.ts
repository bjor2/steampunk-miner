/**
 * The merchant frontage the local replica draws now (ticket 825): the same rule the world piece
 * reads, on the same state, so a spec and the debug read see what is drawn. Null off a planet with
 * a merchant that has authored art (a later system's planets wear templates, #824).
 */
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { readAuthorityState } from '../../../store/authorityLink'
import { assetQuadsOf, type AssetQuad } from '../../../systems/art/assetLook'
import { MERCHANT_ART, merchantFrontageOf, type MerchantFrontage } from '../systems/merchantArt'
import { sessionPlanetIdOf } from '../systems/render/merchantLook'

/** Mounted gear is authored untiered: its one look. */
const FRONTAGE_LOOK = 1

export interface MerchantFrontageDrawn {
  frontage: MerchantFrontage
  quads: AssetQuad[]
}

export function readMerchantFrontageDrawn(): MerchantFrontageDrawn | null {
  const frontage = merchantFrontageOf(MERCHANT_ART, sessionPlanetIdOf(readAuthorityState()))
  if (frontage === null) return null
  return { frontage, quads: assetQuadsOf(SHIPPED_ART, frontage.assetId, FRONTAGE_LOOK) }
}
