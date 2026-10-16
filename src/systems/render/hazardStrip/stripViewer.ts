/**
 * What the local player may see on the hazard strip (Horizontal Scaler, #316 amendment 2, ticket
 * 341): top-tier ore once the existing `scanner_station` row has its `FeatureUnlocked` (P14, no new
 * id), gates against the drill tip the gates read, and the band the rig's nose is in and the
 * planet's top rarity lead (ticket 445) for what counts as top-tier ore. Read from the replicated state each frame, never written back.
 */
import { vehicleOf, type AuthorityState } from '../../authority/authorityState'
import { isFeatureUnlocked } from '../../authority/featureUnlocks'
import { majorOf } from '../../economy/upgradeSteps'
import { KERNEL_TOP_LEAD, topOreLeadOf } from '../../registries/oreTypes'
import type { Vector2 } from '../../vehicle/localFrame'
import type { PlanetParams } from '../../world/planetParams'
import { bandOfTile, isInsidePlanet } from '../../world/planetGeometry'
import type { StripViewer } from './stripPips'

export const SCANNER_STATION_ROW_ID = 'scanner_station'

export function createStripViewer(): StripViewer {
  return { isScannerOpen: false, tipMajor: 0, rigBand: 1, topLead: KERNEL_TOP_LEAD }
}

export function writeStripViewer(
  into: StripViewer,
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  nose: Vector2,
): StripViewer {
  into.isScannerOpen = isFeatureUnlocked(state, SCANNER_STATION_ROW_ID)
  into.tipMajor = majorOf(vehicleOf(state, playerId).levels.drill_tip)
  into.rigBand = bandOfNose(params, nose)
  into.topLead = topOreLeadOf(params)
  return into
}

/** The band of the nose's tile; band 1 above the surface. */
function bandOfNose(params: PlanetParams, nose: Vector2): number {
  const tx = Math.floor(nose.x)
  const ty = Math.floor(nose.y)
  return isInsidePlanet(params, tx, ty) ? bandOfTile(params, tx, ty) : 1
}
