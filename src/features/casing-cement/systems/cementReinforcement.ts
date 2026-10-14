/**
 * casing_cement's `groundReinforcement` provider (ticket 367, piece ii-b of the #157 seam): the
 * cased tiles of `casedTiles.ts`, read from the authority's world. The kernel guards (lava, the
 * core, dynamite and rig gates) are asked before it, and collapse is its only reader, so hardness,
 * the drill_tip gate and the swept span never see it.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { ECONOMY } from '../../../systems/economy/economy'
import type { ReinforcementProvider } from '../../../systems/registries/groundReinforcement'
import { cementTypeIndicesOf, isTileCasedIn, worldCasingReader } from './casedTiles'

export const CEMENT_REINFORCEMENT_ID = 'casing-cement.cased-tiles'

export const CEMENT_REINFORCEMENT: ReinforcementProvider = {
  id: CEMENT_REINFORCEMENT_ID,
  reinforces: isCellCased,
}

/** Whether the tile at (tx, ty) is cased in a cement grade of lining. */
export function isCellCased(state: AuthorityState, tx: number, ty: number): boolean {
  return isTileCasedIn(worldCasingReader(state.world), { tx, ty }, cementTypesOfEconomy())
}

// Collapse asks once per open tile of every block it checks: the static economy's indices once.
let cementTypes: ReadonlySet<number> | null = null

function cementTypesOfEconomy(): ReadonlySet<number> {
  cementTypes ??= cementTypeIndicesOf(ECONOMY.casing.cementGrades)
  return cementTypes
}
