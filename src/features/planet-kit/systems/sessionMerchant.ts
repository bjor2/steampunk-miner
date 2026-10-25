/**
 * The merchant standing at the session's planet (ticket 821, PK2): the variant the rows place on
 * the planet's stable id (s,p), once the `merchants` schedule row is open there. The row opens
 * through the dock facility this slice registers for it (`MERCHANT_FACILITY`), so the schedule,
 * not this slice, says from which planet the merchants trade (#823 moved it to planet 1).
 */
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { corePlanetKeyOf } from '../../../systems/authority/planetCoreBays'
import type { DockFacility } from '../../../systems/registries/dockFacilities'
import type { PlanetId } from '../../solar-systems'
import { merchantOfPlanet } from './planetKitSales'
import type { MerchantRow, PlanetKits } from './planetKitTypes'

/** The schedule row the merchant variants ship (docs/scaling/horizontal/stats.json). */
export const MERCHANTS_ROW_ID = 'merchants'

/** The merchant counter on the dock pad: the building that claims the `merchants` row. */
export const MERCHANT_FACILITY: DockFacility = {
  id: 'planet-kit.merchant',
  scheduleRowId: MERCHANTS_ROW_ID,
}

/** The session planet's stable id, (s,p) as canonical index text (#790). */
export function sessionPlanetIdOf(state: AuthorityState): PlanetId {
  const [system, planet] = corePlanetKeyOf(state.planet).split(':')
  return { system, planet }
}

/** The merchant trading at the session's planet; null where none stands or the row is shut. */
export function sessionMerchantOf(kits: PlanetKits, state: AuthorityState): MerchantRow | null {
  if (!isFeatureUnlocked(state, MERCHANTS_ROW_ID)) return null
  return merchantOfPlanet(kits, sessionPlanetIdOf(state))
}
